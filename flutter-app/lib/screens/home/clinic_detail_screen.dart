import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api_client.dart';
import '../../models/clinic.dart';
import '../../models/doctor.dart';
import '../../services/patient_api.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import 'doctor_availability_screen.dart';

class ClinicDetailScreen extends StatefulWidget {
  final Clinic clinic;
  const ClinicDetailScreen({super.key, required this.clinic});

  @override
  State<ClinicDetailScreen> createState() => _ClinicDetailScreenState();
}

class _ClinicDetailScreenState extends State<ClinicDetailScreen> {
  List<Doctor>? _doctors;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final doctors = await PatientApi.clinicDoctors(widget.clinic.clinicId);
      if (!mounted) return;
      setState(() => _doctors = doctors);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load doctors. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _call() async {
    final uri = Uri(scheme: 'tel', path: widget.clinic.phone);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final clinic = widget.clinic;
    return Scaffold(
      appBar: AppBar(title: Text(clinic.clinicName)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.location_on_outlined, size: 18, color: AppColors.textSecondary),
                        const SizedBox(width: 8),
                        Expanded(child: Text('${clinic.address}, ${clinic.city}, ${clinic.state}')),
                      ],
                    ),
                    if (clinic.openingTime != null && clinic.closingTime != null) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.access_time_rounded, size: 18, color: AppColors.textSecondary),
                          const SizedBox(width: 8),
                          Text('${clinic.openingTime} - ${clinic.closingTime}'),
                        ],
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.phone_outlined, size: 18, color: AppColors.textSecondary),
                        const SizedBox(width: 8),
                        Text(clinic.phone),
                        const Spacer(),
                        TextButton.icon(
                          onPressed: _call,
                          icon: const Icon(Icons.call_rounded, size: 16),
                          label: const Text('Call'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text('Doctors', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            _buildDoctorList(),
          ],
        ),
      ),
    );
  }

  Widget _buildDoctorList() {
    if (_loading) {
      return const Padding(padding: EdgeInsets.only(top: 40), child: LoadingView());
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 20),
        child: ErrorView(message: _error!, onRetry: _load),
      );
    }
    final doctors = _doctors ?? [];
    if (doctors.isEmpty) {
      return const Padding(
        padding: EdgeInsets.only(top: 20),
        child: EmptyState(
          icon: Icons.badge_outlined,
          title: 'No doctors listed yet',
        ),
      );
    }
    return Column(
      children: doctors
          .map(
            (doctor) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                leading: CircleAvatar(
                  backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                  child: const Icon(Icons.person_rounded, color: AppColors.primary),
                ),
                title: Text(doctor.fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  [
                    if (doctor.specialization != null) doctor.specialization!,
                  ].join(' · '),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => DoctorAvailabilityScreen(doctor: doctor, clinic: widget.clinic),
                    ),
                  );
                },
              ),
            ),
          )
          .toList(),
    );
  }
}
