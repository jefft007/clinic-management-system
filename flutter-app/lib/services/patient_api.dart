import '../core/api_client.dart';
import '../models/appointment.dart';
import '../models/availability.dart';
import '../models/clinic.dart';
import '../models/doctor.dart';

class PatientApi {
  static Future<List<Clinic>> searchClinics({String? search, String? city}) async {
    // Combine search and city into the search param since backend expects 'search' for both
    String finalSearch = '';
    if (search != null && search.isNotEmpty) finalSearch += search;
    if (city != null && city.isNotEmpty) {
      if (finalSearch.isNotEmpty) finalSearch += ' ';
      finalSearch += city;
    }
    final res = await ApiClient.instance.get(
      '/patient/clinics',
      query: {if (finalSearch.isNotEmpty) 'search': finalSearch},
    );
    final list = (res['clinics'] as List<dynamic>? ?? []);
    return list.map((e) => Clinic.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<Clinic>> nearbyClinics({
    required double lat,
    required double lng,
    double radiusKm = 25,
  }) async {
    final res = await ApiClient.instance.get(
      '/patient/clinics/nearby',
      query: {'lat': lat, 'lng': lng, 'radius_km': radiusKm},
    );
    final list = (res['clinics'] as List<dynamic>? ?? []);
    return list.map((e) => Clinic.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<Doctor>> clinicDoctors(int clinicId) async {
    final res = await ApiClient.instance.get('/patient/clinics/$clinicId/doctors');
    final list = (res['doctors'] as List<dynamic>? ?? []);
    return list.map((e) => Doctor.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<Availability>> doctorAvailability(
    int doctorId, {
    String? date,
  }) async {
    final res = await ApiClient.instance.get(
      '/patient/doctors/$doctorId/availability',
      query: {if (date != null) 'date': date},
    );
    final list = (res['availability'] as List<dynamic>? ?? []);
    return list.map((e) => Availability.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<({int total, int remaining, List<TokenDetail> tokens})> availabilityTokens(
    int availabilityId,
  ) async {
    final res = await ApiClient.instance.get(
      '/patient/availability/$availabilityId/tokens',
    );
    final list = (res['available_token_details'] as List<dynamic>? ?? []);
    return (
      total: res['total_tokens'] is int ? res['total_tokens'] as int : 0,
      remaining: res['remaining_tokens'] is int ? res['remaining_tokens'] as int : 0,
      tokens: list.map((e) => TokenDetail.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  static Future<Map<String, dynamic>> bookAppointment({
    required int availabilityId,
    required int tokenNumber,
    required String fullName,
    required String phone,
    String? alternatePhone,
    int? age,
    String? gender,
    required String place,
  }) async {
    final res = await ApiClient.instance.post(
      '/patient/appointments',
      body: {
        'availability_id': availabilityId,
        'token_number': tokenNumber,
        'full_name': fullName,
        'phone': phone,
        if (alternatePhone != null && alternatePhone.isNotEmpty)
          'alternate_phone': alternatePhone,
        if (age != null) 'age': age,
        if (gender != null) 'gender': gender,
        'place': place,
      },
    );
    return res['appointment'] as Map<String, dynamic>;
  }

  static Future<List<Appointment>> myAppointments() async {
    final res = await ApiClient.instance.get('/patient/appointments/me', auth: true);
    final list = (res['appointments'] as List<dynamic>? ?? []);
    return list.map((e) => Appointment.fromJson(e as Map<String, dynamic>)).toList();
  }
}
