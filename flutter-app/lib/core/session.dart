import 'package:shared_preferences/shared_preferences.dart';
import 'constants.dart';

/// Wraps shared_preferences for the few bits of state the app needs to
/// remember between launches: the patient's auth token, phone number,
/// display name, and the last city they selected for clinic search.
class Session {
  Session._();
  static final Session instance = Session._();

  String? _token;
  String? _phone;
  String? _name;
  String? _lastCity;

  String? get token => _token;
  String? get phone => _phone;
  String? get name => _name;
  String? get lastCity => _lastCity;
  bool get isLoggedIn => _token != null && _token!.isNotEmpty;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(AppConstants.tokenKey);
    _phone = prefs.getString(AppConstants.phoneKey);
    _name = prefs.getString(AppConstants.nameKey);
    _lastCity = prefs.getString(AppConstants.lastCityKey);
  }

  Future<void> save({
    required String token,
    required String phone,
    required String name,
  }) async {
    _token = token;
    _phone = phone;
    _name = name;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.tokenKey, token);
    await prefs.setString(AppConstants.phoneKey, phone);
    await prefs.setString(AppConstants.nameKey, name);
  }

  Future<void> saveLastCity(String city) async {
    _lastCity = city;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.lastCityKey, city);
  }

  Future<void> clear() async {
    _token = null;
    _phone = null;
    _name = null;
    _lastCity = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.phoneKey);
    await prefs.remove(AppConstants.nameKey);
    await prefs.remove(AppConstants.lastCityKey);
  }
}

