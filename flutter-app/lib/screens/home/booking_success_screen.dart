import 'package:flutter/material.dart';
import '../../models/clinic.dart';
import '../../models/doctor.dart';
import '../../theme/app_theme.dart';
import '../main_shell.dart';

class BookingSuccessScreen extends StatelessWidget {
  final Map<String, dynamic> appointment;
  final Doctor doctor;
  final Clinic clinic;

  const BookingSuccessScreen({
    super.key,
    required this.appointment,
    required this.doctor,
    required this.clinic,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 24),
              Container(
                width: 84,
                height: 84,
                decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, color: Colors.white, size: 48),
              ),
              const SizedBox(height: 20),
              const Text(
                'Appointment Booked!',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              const Text(
                'A confirmation has been saved to your appointments.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary),
              ),
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _row('Doctor', doctor.fullName),
                      _row('Clinic', clinic.clinicName),
                      _row('Date', '${appointment['appointment_date']}'),
                      _row('Session', '${appointment['session']}'),
                      _row('Token Number', '#${appointment['token_number']}'),
                      if (appointment['estimated_time_label'] != null)
                        _row('Estimated Time', '${appointment['estimated_time_label']}'),
                      if (appointment['arrive_by_label'] != null)
                        _row('Arrive By', '${appointment['arrive_by_label']}'),
                      if (appointment['timing_note'] != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          '${appointment['timing_note']}',
                          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const MainShell()),
                    (route) => false,
                  );
                },
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
