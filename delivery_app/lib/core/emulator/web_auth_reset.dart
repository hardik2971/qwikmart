/// Emulator builds on the web only: FlutterFire web restores the persisted Firebase Auth user inside
/// `Firebase.initializeApp` – before `useAuthEmulator` can run – and would validate that session
/// against the PRODUCTION Identity Toolkit. [clearPersistedWebAuth] wipes the persisted session
/// first, so an emulator build never talks to production (it simply starts signed out).
library;

export 'web_auth_reset_stub.dart' if (dart.library.js_interop) 'web_auth_reset_web.dart';
