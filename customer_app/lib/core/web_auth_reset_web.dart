import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Emulator web builds only: removes the persisted Firebase Auth session (IndexedDB `firebaseLocalStorageDb`,
/// `firebase:*` keys in local/session storage) before Firebase starts.
///
/// FlutterFire web restores a persisted user while `Firebase.initializeApp` runs — a network call to the
/// **production** Auth endpoint — before `useAuthEmulator` can be applied; the JS SDK then rejects the emulator
/// (`auth/emulator-config-failed`, swallowed by the plugin) and every later Auth call (anonymous guests, sign-in)
/// goes to production. Starting without a persisted session guarantees the emulator is connected first.
Future<void> clearPersistedAuth() async {
  try {
    for (final name in ['localStorage', 'sessionStorage']) {
      final store = globalContext.getProperty<JSObject?>(name.toJS);
      if (store == null) continue;
      final len = store.getProperty<JSNumber>('length'.toJS).toDartInt;
      final keys = <String>[];
      for (var i = 0; i < len; i++) {
        final k = store.callMethod<JSString?>('key'.toJS, i.toJS)?.toDart;
        if (k != null && k.startsWith('firebase:')) keys.add(k);
      }
      for (final k in keys) {
        store.callMethod<JSAny?>('removeItem'.toJS, k.toJS);
      }
    }
    final idb = globalContext.getProperty<JSObject?>('indexedDB'.toJS);
    if (idb == null) return;
    final req = idb.callMethod<JSObject>('deleteDatabase'.toJS, 'firebaseLocalStorageDb'.toJS);
    final done = Completer<void>();
    void finish(JSAny? _) {
      if (!done.isCompleted) done.complete();
    }

    req.setProperty('onsuccess'.toJS, finish.toJS);
    req.setProperty('onerror'.toJS, finish.toJS);
    req.setProperty('onblocked'.toJS, finish.toJS);
    await done.future.timeout(const Duration(seconds: 2), onTimeout: () {});
  } catch (_) {
    // best effort
  }
}
