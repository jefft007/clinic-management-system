import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/appointment.dart';
import '../theme/app_theme.dart';
import 'common.dart';

class AppointmentCard extends StatelessWidget {
  final Appointment appointment;
  final VoidCallback? onTap;

  const AppointmentCard({super.key, required this.appointment, this.onTap});

  String _formatDate(String raw) {
    try {
      final date = DateTime.parse(raw);
      return DateFormat('EEE, d MMM yyyy').format(date);
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      appointment.doctorName,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                  StatusPill(status: appointment.status),
                ],
              ),
              if (appointment.specialization != null) ...[
                const SizedBox(height: 2),
                Text(
                  appointment.specialization!,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  const Icon(Icons.local_hospital_outlined, size: 15, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      appointment.clinicName,
                      style: const TextStyle(fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  const Icon(Icons.event_outlined, size: 15, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  Text(_formatDate(appointment.appointmentDate), style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 14),
                  const Icon(Icons.confirmation_number_outlined, size: 15, color: AppColors.textSecondary),
                  const SizedBox(width: 6),
                  Text('Token #${appointment.tokenNumber}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
              if (appointment.estimatedTimeLabel != null) ...[
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.schedule_rounded, size: 15, color: AppColors.primary),
                    const SizedBox(width: 6),
                    Text(
                      appointment.estimatedTimeLabel!,
                      style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
