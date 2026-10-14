import '../../core/errors.dart';
import 'mock_backend.dart';

/// Response of the in-app mock data source (same shape the old REST envelope had).
class MockResponse {
  final dynamic data;
  final Map<String, dynamic>? meta;
  final String message;
  const MockResponse({this.data, this.meta, this.message = 'OK'});

  Map<String, dynamic> get map => data is Map ? Map<String, dynamic>.from(data as Map) : <String, dynamic>{};
  List<Map<String, dynamic>> get list {
    final d = data is Map && (data as Map)['data'] is List ? (data as Map)['data'] : data;
    return d is List ? d.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : [];
  }
}

/// Offline demo data source (`USE_MOCK=true`): routes path-style requests to [MockBackend] in memory.
/// Nothing here touches the network.
class MockApi {
  final MockBackend backend;
  final Map<String, String> Function() headers;
  MockApi({required this.headers, MockBackend? backend}) : backend = backend ?? MockBackend();

  Future<MockResponse> get(String path, {Map<String, dynamic>? query}) => request('GET', path, query: query);
  Future<MockResponse> post(String path, {Map<String, dynamic>? body}) => request('POST', path, body: body);
  Future<MockResponse> put(String path, {Map<String, dynamic>? body}) => request('PUT', path, body: body);
  Future<MockResponse> delete(String path) => request('DELETE', path);

  Future<MockResponse> request(String method, String path, {Map<String, dynamic>? query, Map<String, dynamic>? body}) async {
    final clean = path.startsWith('/') ? path.substring(1) : path;
    try {
      final q = Map<String, dynamic>.fromEntries(
          (query ?? const {}).entries.where((e) => e.value != null && e.value.toString().isNotEmpty));
      final res = await backend.handle(method, clean, query: q, body: body ?? const {}, headers: headers());
      return MockResponse(data: res.data, meta: res.meta, message: res.message);
    } catch (e) {
      throw AppException.from(e);
    }
  }
}
