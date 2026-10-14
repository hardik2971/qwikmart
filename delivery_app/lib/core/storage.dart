import 'package:shared_preferences/shared_preferences.dart';

/// Simple settings in shared_preferences. Authentication is persisted by Firebase Auth itself;
/// only the offline demo session (mock backend, no Firebase) is remembered here.
class AppStorage {
  AppStorage._(this._prefs);

  static late AppStorage instance;

  final SharedPreferences _prefs;

  static const _kLocale = 'locale';
  static const _kTheme = 'theme_mode';
  static const _kMockUser = 'mock_user_state';
  static const _kDemoSession = 'demo_session';

  static Future<AppStorage> init() async {
    final prefs = await SharedPreferences.getInstance();
    instance = AppStorage._(prefs);
    // Legacy Sanctum token from older builds – no longer used.
    await prefs.remove('auth_token');
    return instance;
  }

  String? get locale => _prefs.getString(_kLocale);
  Future<void> setLocale(String code) => _prefs.setString(_kLocale, code);

  String? get themeMode => _prefs.getString(_kTheme);
  Future<void> setThemeMode(String mode) => _prefs.setString(_kTheme, mode);

  /// Mock backend: remembers whether the signed-in mock user is the demo
  /// account or a freshly registered (pending) one.
  String? get mockUser => _prefs.getString(_kMockUser);
  Future<void> setMockUser(String? v) async {
    if (v == null) {
      await _prefs.remove(_kMockUser);
    } else {
      await _prefs.setString(_kMockUser, v);
    }
  }

  /// True while signed in to the offline demo (mock backend) – restored on app start.
  bool get demoSession => _prefs.getBool(_kDemoSession) ?? false;
  Future<void> setDemoSession(bool v) => v ? _prefs.setBool(_kDemoSession, true) : _prefs.remove(_kDemoSession);
}
