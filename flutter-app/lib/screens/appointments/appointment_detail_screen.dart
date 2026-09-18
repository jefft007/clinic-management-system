import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../models/appointment.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import '../../services/patient_api.dart';
import '../../core/api_client.dart';

class AppointmentDetailScreen extends StatefulWidget {
  final Appointment appointment;
  const AppointmentDetailScreen({super.key, required this.appointment});

  @override
  State<AppointmentDetailScreen> createState() => _AppointmentDetailScreenState();
}

class _AppointmentDetailScreenState extends State<AppointmentDetailScreen> {
  bool _cancelling = false;

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

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel Appointment'),
        content: const Text('Are you sure you want to cancel this appointment?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _cancelling = true);
    try {
      await PatientApi.cancelAppointment(widget.appointment.appointmentId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Appointment cancelled successfully')),
      );
      Navigator.pop(context, true); // Return true to signal refresh
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.danger),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to cancel appointment'), backgroundColor: AppColors.danger),
      );
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
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
                      '#${widget.appointment.tokenNumber}',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primary),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                StatusPill(status: widget.appointment.status),
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
                  Text(widget.appointment.doctorName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  if (widget.appointment.specialization != null)
                    Text(widget.appointment.specialization!, style: const TextStyle(color: AppColors.textSecondary)),
                  const Divider(height: 28),
                  _sectionTitle('Clinic'),
                  Text(widget.appointment.clinicName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  if (widget.appointment.clinicAddress != null)
                    Text('${widget.appointment.clinicAddress}, ${widget.appointment.clinicCity ?? ''}',
                        style: const TextStyle(color: AppColors.textSecondary)),
                  if (widget.appointment.clinicPhone != null) ...[
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: () => _call(widget.appointment.clinicPhone!),
                      icon: const Icon(Icons.call_rounded, size: 16),
                      label: Text(widget.appointment.clinicPhone!),
                    ),
                  ],
                  const Divider(height: 28),
                  _sectionTitle('Visit'),
                  _row('Date', _formatDate(widget.appointment.appointmentDate)),
                  _row('Session', widget.appointment.session),
                  _row('Token Number', '#${widget.appointment.tokenNumber}'),
                  if (widget.appointment.estimatedTimeLabel != null)
                    _row('Estimated Time', widget.appointment.estimatedTimeLabel!.split(' - ').first),
                  if (widget.appointment.arriveByLabel != null)
                    _row('Arrive By', widget.appointment.arriveByLabel!),
                ],
              ),
            ),
          ),
          if (widget.appointment.isUpcoming && widget.appointment.status != 'Cancelled') ...[
            const SizedBox(height: 24),
            _cancelling
                ? const Center(child: CircularProgressIndicator())
                : ElevatedButton(
                    onPressed: _cancel,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.danger,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Cancel Appointment'),
                  ),
          ],
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

