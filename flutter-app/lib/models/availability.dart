class Availability {
  final int availabilityId;
  final int doctorId;
  final String availableDate; // yyyy-MM-dd
  final String session; // Morning / Evening
  final String startTime;
  final String endTime;
  final int averageConsultationMinutes;
  final bool isLeave;

  Availability({
    required this.availabilityId,
    required this.doctorId,
    required this.availableDate,
    required this.session,
    required this.startTime,
    required this.endTime,
    required this.averageConsultationMinutes,
    required this.isLeave,
  });

  factory Availability.fromJson(Map<String, dynamic> json) {
    return Availability(
      availabilityId: json['availability_id'] is int
          ? json['availability_id']
          : int.parse(json['availability_id'].toString()),
      doctorId: json['doctor_id'] is int
          ? json['doctor_id']
          : int.parse(json['doctor_id'].toString()),
      availableDate: json['available_date']?.toString() ?? '',
      session: json['session']?.toString() ?? '',
      startTime: json['start_time']?.toString() ?? '',
      endTime: json['end_time']?.toString() ?? '',
      averageConsultationMinutes:
          int.tryParse(json['average_consultation_minutes']?.toString() ?? '') ?? 5,
      isLeave: json['is_leave'] == 1 || json['is_leave'] == true,
    );
  }
}

class TokenDetail {
  final int tokenNumber;
  final String? estimatedStartTime;
  final String? estimatedTimeLabel;
  final String? arriveByLabel;
  final String? note;
  final String? bookingSource;
  final bool? isAvailable;
  final String? status;

  TokenDetail({
    required this.tokenNumber,
    this.estimatedStartTime,
    this.estimatedTimeLabel,
    this.arriveByLabel,
    this.note,
    this.bookingSource,
    this.isAvailable,
    this.status,
  });

  factory TokenDetail.fromJson(Map<String, dynamic> json) {
    return TokenDetail(
      tokenNumber: json['token_number'] is int
          ? json['token_number']
          : int.parse(json['token_number'].toString()),
      estimatedStartTime: json['estimated_start_time']?.toString(),
      estimatedTimeLabel: json['estimated_time_label']?.toString(),
      arriveByLabel: json['arrive_by_label']?.toString(),
      note: json['note']?.toString(),
      bookingSource: json['booking_source']?.toString(),
      isAvailable: json['is_available'] as bool?,
      status: json['status']?.toString(),
    );
  }
}
