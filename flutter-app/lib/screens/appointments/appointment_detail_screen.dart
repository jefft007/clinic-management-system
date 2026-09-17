import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/appointment.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';

class AppointmentDetailScreen extends StatelessWidget {
  final Appointment appointment;
  const AppointmentDetailScreen({super.key, required this.appointment});

  String _formatDate(String raw) {
    try {
      final date = DateTime.parse(raw);
      return DateFormat('EEEE, d MMMM yyyy').format(date);
    } catch (_) {
      return raw;
    }
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Appointment Details')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      '#${appointment.tokenNumber}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primary),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                StatusPill(status: appointment.status),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _sectionTitle('Doctor'),
                  Text(appointment.doctorName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  if (appointment.specialization != null)
                    Text(appointment.specialization!, style: const TextStyle(color: AppColors.textSecondary)),
                  const Divider(height: 28),
                  _sectionTitle('Clinic'),
                  Text(appointment.clinicName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  if (appointment.clinicAddress != null)
                    Text('${appointment.clinicAddress}, ${appointment.clinicCity ?? ''}',
                        style: const TextStyle(color: AppColors.textSecondary)),
                  if (appointment.clinicPhone != null) ...[
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: () => _call(appointment.clinicPhone!),
                      icon: const Icon(Icons.call_rounded, size: 16),
                      label: Text(appointment.clinicPhone!),
                    ),
                  ],
                  const Divider(height: 28),
                  _sectionTitle('Visit'),
                  _row('Date', _formatDate(appointment.appointmentDate)),
                  _row('Session', appointment.session),
                  _row('Token Number', '#${appointment.tokenNumber}'),
                  if (appointment.estimatedTimeLabel != null)
                    _row('Estimated Time', appointment.estimatedTimeLabel!),
                  if (appointment.arriveByLabel != null)
                    _row('Arrive By', appointment.arriveByLabel!),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary,
            letterSpacing: 0.5,
          ),
        ),
      );

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 120, child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
        ],
      ),
    );
  }
}
