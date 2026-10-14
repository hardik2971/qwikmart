import 'dart:async';

/// Emits `combine(latest values)` once every stream has emitted at least once, and again on each
/// subsequent event (a tiny `combineLatest` – avoids an rxdart dependency). Errors are forwarded.
Stream<R> combineLatest<R>(List<Stream<dynamic>> streams, R Function(List<dynamic> values) combine) {
  late StreamController<R> controller;
  final subs = <StreamSubscription<dynamic>>[];
  final values = List<dynamic>.filled(streams.length, null);
  final has = List<bool>.filled(streams.length, false);

  void start() {
    for (var i = 0; i < streams.length; i++) {
      subs.add(streams[i].listen(
        (v) {
          values[i] = v;
          has[i] = true;
          if (has.every((h) => h)) {
            try {
              controller.add(combine(List.unmodifiable(values)));
            } catch (e, st) {
              controller.addError(e, st);
            }
          }
        },
        onError: controller.addError,
      ));
    }
  }

  Future<void> stop() async {
    for (final s in subs) {
      await s.cancel();
    }
    subs.clear();
  }

  controller = StreamController<R>(onListen: start, onCancel: stop);
  return controller.stream;
}
