/* llmnav/1 module
id=workduck.process.tree
role=Own spawned process trees and terminate their descendants across Windows jobs and Unix process groups.
owns=process tree spawning|cross-platform termination|active process registry
excludes=task command selection|terminal output buffering
search=process tree shutdown|descendant process termination|application shutdown|windows job object|unix process group
invariant=Dropping an active process owner or shutting down the app cannot intentionally leave its registered descendants running.
stability=architecture
*/

use std::{
    collections::HashMap,
    io,
    process::{Child, Command, ExitStatus},
    sync::{Mutex, MutexGuard, OnceLock, atomic::{AtomicU64, Ordering}},
    thread,
    time::Duration,
};

use wait_timeout::ChildExt;

const TERMINATION_GRACE_PERIOD: Duration = Duration::from_secs(2);
const SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(25);
static NEXT_PROCESS_TREE_ID: AtomicU64 = AtomicU64::new(1);
static ACTIVE_PROCESS_TREES: OnceLock<Mutex<HashMap<u64, ProcessTreeIdentity>>> = OnceLock::new();

pub(crate) struct ProcessTreeChild {
    child: Child,
    #[cfg(windows)]
    job: WindowsJob,
    #[cfg(unix)]
    process_group_id: i32,
    registration_id: u64,
}

impl ProcessTreeChild {
    pub(crate) fn spawn(command: &mut Command) -> io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }

        #[cfg(windows)]
        let job = WindowsJob::new()?;
        let mut child = command.spawn()?;

        #[cfg(windows)]
        if let Err(error) = job.assign(&child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }

        #[cfg(unix)]
        let process_group_id = child.id() as i32;
        let identity = process_tree_identity(
            #[cfg(windows)]
            &job,
            #[cfg(unix)]
            process_group_id,
        );
        let registration_id = register_process_tree(identity);

        Ok(Self {
            child,
            #[cfg(windows)]
            job,
            #[cfg(unix)]
            process_group_id,
            registration_id,
        })
    }

    pub(crate) fn child_mut(&mut self) -> &mut Child {
        &mut self.child
    }

    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.child.try_wait()
    }

    pub(crate) fn wait_timeout(&mut self, timeout: Duration) -> io::Result<Option<ExitStatus>> {
        self.child.wait_timeout(timeout)
    }

    pub(crate) fn terminate(&mut self) -> io::Result<ExitStatus> {
        if let Some(status) = self.child.try_wait()? {
            return Ok(status);
        }

        self.request_graceful_termination()?;
        if let Some(status) = self.child.wait_timeout(TERMINATION_GRACE_PERIOD)? {
            return Ok(status);
        }

        self.force_terminate()?;
        self.child.wait()
    }

    #[cfg(windows)]
    fn request_graceful_termination(&mut self) -> io::Result<()> {
        self.job.terminate()
    }

    #[cfg(unix)]
    fn request_graceful_termination(&mut self) -> io::Result<()> {
        signal_process_group(self.process_group_id, 15)
    }

    #[cfg(not(any(windows, unix)))]
    fn request_graceful_termination(&mut self) -> io::Result<()> {
        self.child.kill()
    }

    #[cfg(windows)]
    fn force_terminate(&mut self) -> io::Result<()> {
        self.job.terminate()
    }

    #[cfg(unix)]
    fn force_terminate(&mut self) -> io::Result<()> {
        signal_process_group(self.process_group_id, 9)
    }

    #[cfg(not(any(windows, unix)))]
    fn force_terminate(&mut self) -> io::Result<()> {
        self.child.kill()
    }
}

impl Drop for ProcessTreeChild {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.force_terminate();
            let _ = self.child.wait();
        }
        unregister_process_tree(self.registration_id);
    }
}

pub(crate) fn shutdown_all_process_trees() {
    let registry = lock_active_process_trees();
    let identities = registry.values().copied().collect::<Vec<_>>();

    for identity in &identities {
        let _ = identity.request_graceful_termination();
    }

    let deadline = std::time::Instant::now() + TERMINATION_GRACE_PERIOD;
    while std::time::Instant::now() < deadline
        && identities.iter().any(|identity| identity.is_running())
    {
        thread::sleep(SHUTDOWN_POLL_INTERVAL);
    }

    for identity in identities {
        if identity.is_running() {
            let _ = identity.force_terminate();
        }
    }
}

#[derive(Clone, Copy)]
enum ProcessTreeIdentity {
    #[cfg(windows)]
    WindowsJob(usize),
    #[cfg(unix)]
    UnixProcessGroup(i32),
    #[cfg(not(any(windows, unix)))]
    Unsupported,
}

impl ProcessTreeIdentity {
    fn request_graceful_termination(self) -> io::Result<()> {
        match self {
            #[cfg(windows)]
            Self::WindowsJob(handle) => terminate_windows_job(handle),
            #[cfg(unix)]
            Self::UnixProcessGroup(process_group_id) => {
                signal_process_group(process_group_id, 15)
            }
            #[cfg(not(any(windows, unix)))]
            Self::Unsupported => Ok(()),
        }
    }

    fn force_terminate(self) -> io::Result<()> {
        match self {
            #[cfg(windows)]
            Self::WindowsJob(handle) => terminate_windows_job(handle),
            #[cfg(unix)]
            Self::UnixProcessGroup(process_group_id) => {
                signal_process_group(process_group_id, 9)
            }
            #[cfg(not(any(windows, unix)))]
            Self::Unsupported => Ok(()),
        }
    }

    fn is_running(self) -> bool {
        match self {
            #[cfg(windows)]
            Self::WindowsJob(handle) => windows_job_is_running(handle),
            #[cfg(unix)]
            Self::UnixProcessGroup(process_group_id) => process_group_is_running(process_group_id),
            #[cfg(not(any(windows, unix)))]
            Self::Unsupported => false,
        }
    }
}

fn active_process_trees() -> &'static Mutex<HashMap<u64, ProcessTreeIdentity>> {
    ACTIVE_PROCESS_TREES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_process_tree(identity: ProcessTreeIdentity) -> u64 {
    let registration_id = NEXT_PROCESS_TREE_ID.fetch_add(1, Ordering::Relaxed);
    lock_active_process_trees().insert(registration_id, identity);
    registration_id
}

fn unregister_process_tree(registration_id: u64) {
    lock_active_process_trees().remove(&registration_id);
}

fn lock_active_process_trees() -> MutexGuard<'static, HashMap<u64, ProcessTreeIdentity>> {
    active_process_trees()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(windows)]
fn process_tree_identity(job: &WindowsJob) -> ProcessTreeIdentity {
    ProcessTreeIdentity::WindowsJob(job.0 as usize)
}

#[cfg(unix)]
fn process_tree_identity(process_group_id: i32) -> ProcessTreeIdentity {
    ProcessTreeIdentity::UnixProcessGroup(process_group_id)
}

#[cfg(not(any(windows, unix)))]
fn process_tree_identity() -> ProcessTreeIdentity {
    ProcessTreeIdentity::Unsupported
}

#[cfg(unix)]
fn signal_process_group(process_group_id: i32, signal: i32) -> io::Result<()> {
    unsafe extern "C" {
        fn kill(process_id: i32, signal: i32) -> i32;
    }

    let result = unsafe { kill(-process_group_id, signal) };
    if result == 0 {
        return Ok(());
    }

    let error = io::Error::last_os_error();
    if error.raw_os_error() == Some(3) {
        Ok(())
    } else {
        Err(error)
    }
}

#[cfg(unix)]
fn process_group_is_running(process_group_id: i32) -> bool {
    unsafe extern "C" {
        fn kill(process_id: i32, signal: i32) -> i32;
    }

    unsafe { kill(-process_group_id, 0) == 0 }
}

#[cfg(windows)]
fn terminate_windows_job(handle: usize) -> io::Result<()> {
    if unsafe { windows_ffi::TerminateJobObject(handle as *mut core::ffi::c_void, 1) } == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn windows_job_is_running(handle: usize) -> bool {
    let mut information = windows_ffi::JobObjectBasicAccountingInformation::default();
    let queried = unsafe {
        windows_ffi::QueryInformationJobObject(
            handle as *mut core::ffi::c_void,
            windows_ffi::JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION_CLASS,
            (&mut information as *mut windows_ffi::JobObjectBasicAccountingInformation).cast(),
            std::mem::size_of::<windows_ffi::JobObjectBasicAccountingInformation>() as u32,
            std::ptr::null_mut(),
        )
    };
    queried != 0 && information.active_processes > 0
}

#[cfg(windows)]
struct WindowsJob(*mut core::ffi::c_void);

#[cfg(windows)]
unsafe impl Send for WindowsJob {}

#[cfg(windows)]
impl WindowsJob {
    fn new() -> io::Result<Self> {
        use std::{mem::size_of, ptr};

        let handle = unsafe { windows_ffi::CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }

        let mut information = windows_ffi::JobObjectExtendedLimitInformation::default();
        information.basic_limit_information.limit_flags =
            windows_ffi::JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            windows_ffi::SetInformationJobObject(
                handle,
                windows_ffi::JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                (&information as *const windows_ffi::JobObjectExtendedLimitInformation).cast(),
                size_of::<windows_ffi::JobObjectExtendedLimitInformation>() as u32,
            )
        };
        if configured == 0 {
            let error = io::Error::last_os_error();
            unsafe {
                windows_ffi::CloseHandle(handle);
            }
            return Err(error);
        }

        Ok(Self(handle))
    }

    fn assign(&self, child: &Child) -> io::Result<()> {
        use std::os::windows::io::AsRawHandle;
        let assigned = unsafe {
            windows_ffi::AssignProcessToJobObject(self.0, child.as_raw_handle().cast())
        };
        if assigned == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    fn terminate(&self) -> io::Result<()> {
        if unsafe { windows_ffi::TerminateJobObject(self.0, 1) } == 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_ffi::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
#[allow(non_snake_case)]
mod windows_ffi {
    use core::ffi::c_void;

    pub const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
    pub const JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION_CLASS: i32 = 1;
    pub const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;

    #[repr(C)]
    #[derive(Default)]
    pub struct JobObjectBasicLimitInformation {
        pub per_process_user_time_limit: i64,
        pub per_job_user_time_limit: i64,
        pub limit_flags: u32,
        pub minimum_working_set_size: usize,
        pub maximum_working_set_size: usize,
        pub active_process_limit: u32,
        pub affinity: usize,
        pub priority_class: u32,
        pub scheduling_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct JobObjectBasicAccountingInformation {
        pub total_user_time: i64,
        pub total_kernel_time: i64,
        pub this_period_total_user_time: i64,
        pub this_period_total_kernel_time: i64,
        pub total_page_fault_count: u32,
        pub total_processes: u32,
        pub active_processes: u32,
        pub total_terminated_processes: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct IoCounters {
        pub read_operation_count: u64,
        pub write_operation_count: u64,
        pub other_operation_count: u64,
        pub read_transfer_count: u64,
        pub write_transfer_count: u64,
        pub other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    pub struct JobObjectExtendedLimitInformation {
        pub basic_limit_information: JobObjectBasicLimitInformation,
        pub io_info: IoCounters,
        pub process_memory_limit: usize,
        pub job_memory_limit: usize,
        pub peak_process_memory_used: usize,
        pub peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn AssignProcessToJobObject(job: *mut c_void, process: *mut c_void) -> i32;
        pub fn CloseHandle(object: *mut c_void) -> i32;
        pub fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> *mut c_void;
        pub fn QueryInformationJobObject(
            job: *mut c_void,
            information_class: i32,
            information: *mut c_void,
            information_length: u32,
            return_length: *mut u32,
        ) -> i32;
        pub fn SetInformationJobObject(
            job: *mut c_void,
            information_class: i32,
            information: *const c_void,
            information_length: u32,
        ) -> i32;
        pub fn TerminateJobObject(job: *mut c_void, exit_code: u32) -> i32;
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use core::ffi::c_void;
    use std::{
        io::{BufRead, BufReader},
        process::Stdio,
    };

    const PROCESS_SYNCHRONIZE: u32 = 0x0010_0000;
    const WAIT_OBJECT_0: u32 = 0;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn OpenProcess(access: u32, inherit_handle: i32, process_id: u32) -> *mut c_void;
        fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
    }

    #[test]
    fn windows_job_termination_stops_descendant_process() {
        let powershell = std::env::var_os("SystemRoot")
            .map(std::path::PathBuf::from)
            .expect("SystemRoot")
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        let script = concat!(
            "$child = Start-Process -FilePath $env:ComSpec ",
            "-ArgumentList '/D','/C','ping 127.0.0.1 -n 30 >nul' ",
            "-WindowStyle Hidden -PassThru; ",
            "[Console]::Out.WriteLine([string]$child.Id); ",
            "[Console]::Out.Flush(); ",
            "Wait-Process -Id $child.Id"
        );
        let mut command = Command::new(powershell);
        command
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script])
            .stdout(Stdio::piped());
        let mut process = ProcessTreeChild::spawn(&mut command).expect("process tree");
        let stdout = process
            .child_mut()
            .stdout
            .take()
            .expect("captured process-tree stdout");
        let mut descendant_pid = String::new();
        let bytes_read = BufReader::new(stdout)
            .read_line(&mut descendant_pid)
            .expect("descendant pid readiness signal");
        assert!(bytes_read > 0, "descendant pid readiness signal was missing");
        let descendant_pid = descendant_pid
            .trim()
            .parse::<u32>()
            .expect("numeric descendant pid");

        process.terminate().expect("terminate process tree");

        let descendant = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, descendant_pid) };
        if !descendant.is_null() {
            assert_eq!(unsafe { WaitForSingleObject(descendant, 5_000) }, WAIT_OBJECT_0);
            unsafe {
                windows_ffi::CloseHandle(descendant);
            }
        }
    }
}
