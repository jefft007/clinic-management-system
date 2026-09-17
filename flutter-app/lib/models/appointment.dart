class Appointment {
  final int appointmentId;
  final int patientId;
  final int doctorId;
  final int clinicId;
  final String appointmentDate;
  final String session;
  final int tokenNumber;
  final String status;
  final String clinicName;
  final String? clinicAddress;
  final String? clinicCity;
  final String? clinicPhone;
  final String doctorName;
  final String? specialization;
  final bool isUpcoming;
  final String? estimatedTimeLabel;
  final String? arriveByLabel;

  Appointment({
    required this.appointmentId,
    required this.patientId,
    required this.doctorId,
    required this.clinicId,
    required this.appointmentDate,
    required this.session,
    required this.tokenNumber,
    required this.status,
    required this.clinicName,
    this.clinicAddress,
    this.clinicCity,
    this.clinicPhone,
    required this.doctorName,
    this.specialization,
    required this.isUpcoming,
    this.estimatedTimeLabel,
    this.arriveByLabel,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      appointmentId: json['appointment_id'] is int
          ? json['appointment_id']
          : int.parse(json['appointment_id'].toString()),
      patientId: json['patient_id'] is int
          ? json['patient_id']
          : int.parse(json['patient_id'].toString()),
      doctorId: json['doctor_id'] is int
          ? json['doctor_id']
          : int.parse(json['doctor_id'].toString()),
      clinicId: json['clinic_id'] is int
          ? json['clinic_id']
          : int.parse(json['clinic_id'].toString()),
      appointmentDate: json['appointment_date']?.toString() ?? '',
      session: json['session']?.toString() ?? '',
      tokenNumber: json['token_number'] is int
          ? json['token_number']
          : int.parse(json['token_number'].toString()),
      status: json['status']?.toString() ?? '',
      clinicName: json['clinic_name']?.toString() ?? '',
      clinicAddress: json['clinic_address']?.toString(),
      clinicCity: json['clinic_city']?.toString(),
      clinicPhone: json['clinic_phone']?.toString(),
      doctorName: json['doctor_name']?.toString() ?? '',
      specialization: json['specialization']?.toString(),
      isUpcoming: json['is_upcoming'] == true,
      estimatedTimeLabel: json['estimated_time_label']?.toString(),
      arriveByLabel: json['arrive_by_label']?.toString(),
    );
  }
}
