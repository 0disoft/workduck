# Workspace sync native verification

`bun run verify:sync-native`는 암호화 sync의 desktop 왕복과 재시작 후 SQLite 영속성을 실제 Tauri 앱에서 확인하는 opt-in 절차예요.
Windows/WebView2에서만 동작하고, Bun, Cargo, Git과 저장소 의존성이 설치되어 있어야 해요. 기본 `bun run verify`, CI, 런타임, API, DB, 의존성은 그대로이고,
이번 변경으로 runner 스크립트와 package 명령만 추가됐어요.

Playwright는 선택 개발 도구예요. package 의존성으로는 추가하지 않았고, 일반 패키지 해석이 안 되면 이미 설치된 Playwright ESM 엔트리(index.mjs) 경로를 지정하면 돼요.

```powershell
$env:WORKDUCK_PLAYWRIGHT_MODULE = '<playwright-index.mjs 경로>'
bun run verify:sync-native
```

실행마다 `dist/native-sync-smoke/<UUID>` 폴더를 만들고 `appDirectoriesOverride`로 앱 데이터를 그 안에 묶어요. 실제 native SQLite 파일과 WebView 프로필이 격리되고,
픽스처를 쓰기 전에 DB 경로가 그 폴더 안인지 먼저 확인해요. `setTauriInvokeForTest` 같은 테스트용 invoke 대체는 쓰지 않고, 진짜 Tauri 데스크톱과 Vite UI로
workspace, project, group, repository 픽스처를 실제 IPC로 시드해요.

UI에서 암호화 파일을 내보내고, 잘못된 암호로 불러오면 비어 있는 픽스처 상태가 그대로 유지돼요. 암호가 맞으면 정확한 ID와 Windows 경로가 복원돼요.

`exit_workduck`로 실제 종료한 뒤 복사해둔 실행 파일을 다시 띄워도 두 레지스트리가 그대로 남고, 암호 입력창은 비어 있어요. sync 폴더는 remote 없는 새 Git 저장소라
네트워크 Git 동기화는 하지 않아요.

결과와 로그는 ignored 경로 `dist/native-sync-smoke/<UUID>` 아래에 남고, 스크립트가 띄운 프로세스는 정리해요. `report.json`에는 runner가 `sourceVersion`,
`runnerSha256`, `completedAtUtc`를 직접 기록해서 어떤 버전과 runner 리비전이 언제 이 증거를 만들었는지 확인할 수 있어요.

1.9.48(`f02abfe`) 시점에 공개 명령 `bun run verify:sync-native`가 exit 0으로 PASS했어요. 고유 `appDirectoriesOverride` 격리, 실제 암호화·IPC·SQLite, 잘못된 암호 거부, 정확한 복원, 정상 종료 후 재시작이
모두 통과했고, 스냅샷이 권위 있는 native SQLite workspace 행과 UI 캐시를 직접 대조한 `workspaceCacheMatchesSqlite: true`와 `pageErrors: 0`까지 확인됐어요.
그때 만든 리포트는 `dist/native-sync-smoke/457940f1-e86b-4e50-8646-bc612c7cd5c0/report.json`이고 완료 시각은 `2026-10-12T01:48:24.696Z`, WebView2 154.0.4258.62에서 통과했어요. 이 리포트의 `runnerSha256`은 그 시점 스크립트 리비전에 묶인 값이에요. 이후 runner가 확장돼서 현재 스크립트 해시는 이 값과 다르고, 위 통과 기록은 그 시점의 historical baseline으로만 봐요.

한계는 정상 종료와 재시작만 다룬다는 점이에요. 트랜잭션 중 프로세스 강제 종료, 전원 손실, 동시 렌더러, 원격 sync, 다른 OS, 설치된 프로덕션 빌드는 검증하지 않았어요.

확장 runner의 stale 기대값 거부 단계는 1.9.49에서 PASS했어요. 실제 native `write_app_state_records`로 다른 변경을 넣어 renderer 기대값을 stale로 만들고, UI 동기화 받기 동작에서 실제 SQLite guard가 거부하고 충돌 안내를 표시하며 외부 DB 변경·기존 project·cache가 그대로 남는 것을 확인했어요(`staleRestoreRejected`·`concurrentDataPreserved`·`conflictMessageShown` 모두 true).
이어서 페이지를 새로고침한 뒤 새 확인을 거쳐 복원을 다시 시도했어요. 이 리포트는 `dist/native-sync-smoke/5972097d-8ab3-452c-b569-06fad551ed74/report.json`이고 완료 시각은 `2026-10-12T02:03:52.107Z`, WebView2 154.0.4258.62, `pageErrors: 0`예요. `runnerSha256`(`f4409a1b...80ba`)은 현재 runner 스크립트와 일치하고, 요약 receipt는 [workspace-sync-native-conflict-2026-10-12.json](workspace-sync-native-conflict-2026-10-12.json)이에요.
이 단계는 renderer 한 개에서 native 쓰기로 외부 변경을 주입한 stale guard 검사이고, 두 창이 동시에 경합하는지는 검사하지 않아요. 위 한계 목록은 그대로예요.
