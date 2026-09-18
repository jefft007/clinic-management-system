class Doctor {
  final int doctorId;
  final int clinicId;
  final String fullName;
  final String? specialization;
  final String? qualification;
  final num? consultationFee;
  final String? bookingVisibleUntil;

  Doctor({
    required this.doctorId,
    required this.clinicId,
    required this.fullName,
    this.specialization,
    this.qualification,
    this.consultationFee,
    this.bookingVisibleUntil,
  });

  factory Doctor.fromJson(Map<String, dynamic> json) {
    return Doctor(
      doctorId: json['doctor_id'] is int
          ? json['doctor_id']
          : int.parse(json['doctor_id'].toString()),
      clinicId: json['clinic_id'] is int
          ? json['clinic_id']
          : int.parse(json['clinic_id'].toString()),
      fullName: (json['doctor_name'] ?? json['full_name'])?.toString() ?? '',
      specialization: json['specialization']?.toString(),
      qualification: json['qualification']?.toString(),
      consultationFee: json['consultation_fee'] == null
          ? null
          : num.tryParse(json['consultation_fee'].toString()),
      bookingVisibleUntil: json['booking_visible_until']?.toString(),
    );
  }
}
