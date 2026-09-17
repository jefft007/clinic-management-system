class Clinic {
  final int clinicId;
  final String clinicName;
  final String address;
  final String city;
  final String state;
  final String phone;
  final String? email;
  final double? latitude;
  final double? longitude;
  final String? openingTime;
  final String? closingTime;
  final String? clinicType;
  final double? distanceKm;

  Clinic({
    required this.clinicId,
    required this.clinicName,
    required this.address,
    required this.city,
    required this.state,
    required this.phone,
    this.email,
    this.latitude,
    this.longitude,
    this.openingTime,
    this.closingTime,
    this.clinicType,
    this.distanceKm,
  });

  factory Clinic.fromJson(Map<String, dynamic> json) {
    double? toDouble(dynamic v) =>
        v == null ? null : double.tryParse(v.toString());

    return Clinic(
      clinicId: json['clinic_id'] is int
          ? json['clinic_id']
          : int.parse(json['clinic_id'].toString()),
      clinicName: json['clinic_name']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      city: json['city']?.toString() ?? '',
      state: json['state']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      email: json['email']?.toString(),
      latitude: toDouble(json['latitude']),
      longitude: toDouble(json['longitude']),
      openingTime: json['opening_time']?.toString(),
      closingTime: json['closing_time']?.toString(),
      clinicType: json['clinic_type']?.toString(),
      distanceKm: toDouble(json['distance_km']),
    );
  }
}
