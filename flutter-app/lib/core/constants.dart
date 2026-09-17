/// Central place for anything environment-specific.
///
/// During development on a real device/emulator, `localhost` on your
/// computer is NOT reachable from the phone — use your machine's LAN IP
/// (e.g. http://192.168.1.20:5000) or, for the Android emulator only,
/// http://10.0.2.2:5000.
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://clinic-management-system-8c9d.onrender.com/api',
  );

  // Run with:
  //   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5000/api
  // so you don't have to hardcode/edit this file per machine.
}

class AppConstants {
  static const String tokenKey = 'patient_auth_token';
  static const String phoneKey = 'patient_phone';
  static const String nameKey = 'patient_name';
  static const String lastCityKey = 'patient_last_city';
  static const String profileKey = 'patient_profile_cache';
}
