import 'package:flutter/foundation.dart';
import '../core/session.dart';

class AuthState extends ChangeNotifier {
  bool _initialized = false;
  bool get initialized => _initialized;

  bool get isLoggedIn => Session.instance.isLoggedIn;
  String? get phone => Session.instance.phone;
  String? get name => Session.instance.name;
  String? get lastCity => Session.instance.lastCity;

  Future<void> bootstrap() async {
    await Session.instance.load();
    _initialized = true;
    notifyListeners();
  }

  Future<void> loginSuccess({
    required String token,
    required String phone,
    required String name,
  }) async {
    await Session.instance.save(token: token, phone: phone, name: name);
    notifyListeners();
  }

  Future<void> saveLastCity(String city) async {
    await Session.instance.saveLastCity(city);
    notifyListeners();
  }

  Future<void> logout() async {
    await Session.instance.clear();
    notifyListeners();
  }
}

