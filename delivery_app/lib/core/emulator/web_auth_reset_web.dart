import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

/// Deletes the Firebase Auth persistence (IndexedDB `firebaseLocalStorageDb`, `firebase:*` keys in
/// local / session storage). Never throws; gives up after 3 s.
Future<void> clearPersistedWebAuth() async {
  for (final name in ['localStorage', 'sessionStorage']) {
    try {
      final storage = globalContext.getProperty<JSObject?>(name.toJS);
      if (storage == null) continue;
      final length = storage.getProperty<JSNumber>('length'.toJS).toDartInt;
      final keys = <String>[];
      for (var i = 0; i < length; i++) {
        final k = storage.callMethod<JSString?>('key'.toJS, i.toJS)?.toDart;
        if (k != null && k.startsWith('firebase:')) keys.add(k);
      }
      for (final k in keys) {
        storage.callMethod<JSAny?>('removeItem'.toJS, k.toJS);
      }
    } catch (_) {}
  }
  try {
    final idb = globalContext.getProperty<JSObject?>('indexedDB'.toJS);
    if (idb == null) return;
    final done = Completer<void>();
    final req = idb.callMethod<JSObject>('deleteDatabase'.toJS, 'firebaseLocalStorageDb'.toJS);
    void finish(JSAny? _) {
      if (!done.isCompleted) done.complete();
    }

    req.setProperty('onsuccess'.toJS, finish.toJS);
    req.setProperty('onerror'.toJS, finish.toJS);
    req.setProperty('onblocked'.toJS, finish.toJS);
    await done.future.timeout(const Duration(seconds: 3), onTimeout: () {});
  } catch (_) {}
}
