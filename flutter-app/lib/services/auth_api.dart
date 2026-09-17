import '../core/api_client.dart';

class OtpRequestResult {
  final int expiresInSeconds;
  final String? debugOtp; // only present when backend is not in production
  OtpRequestResult({required this.expiresInSeconds, this.debugOtp});
}

class OtpVerifyResult {
  final String token;
  final String phone;
  final Map<String, dynamic>? profile;
  OtpVerifyResult({required this.token, required this.phone, this.profile});
}

class AuthApi {
  static Future<OtpRequestResult> requestOtp(String phone) async {
    final res = await ApiClient.instance.post(
      '/patient/auth/request-otp',
      body: {'phone': phone},
    );
    return OtpRequestResult(
      expiresInSeconds: res['expires_in_seconds'] ?? 300,
      debugOtp: res['debug_otp']?.toString(),
    );
  }

  static Future<OtpVerifyResult> verifyOtp(String phone, String otp) async {
    final res = await ApiClient.instance.post(
      '/patient/auth/verify-otp',
      body: {'phone': phone, 'otp': otp},
    );
    return OtpVerifyResult(
      token: res['token'].toString(),
      phone: res['phone'].toString(),
      profile: res['profile'] as Map<String, dynamic>?,
    );
  }
}
