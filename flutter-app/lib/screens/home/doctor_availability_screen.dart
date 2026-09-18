import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api_client.dart';
import '../../models/availability.dart';
import '../../models/clinic.dart';
import '../../models/doctor.dart';
import '../../services/patient_api.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart';
import 'token_select_screen.dart';

class DoctorAvailabilityScreen extends StatefulWidget {
  final Doctor doctor;
  final Clinic clinic;
  const DoctorAvailabilityScreen({super.key, required this.doctor, required this.clinic});

  @override
  State<DoctorAvailabilityScreen> createState() => _DoctorAvailabilityScreenState();
}

class _DoctorAvailabilityScreenState extends State<DoctorAvailabilityScreen> {
  List<Availability>? _slots;
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
      final slots = await PatientApi.doctorAvailability(widget.doctor.doctorId);
      if (!mounted) return;
      setState(() => _slots = slots);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load availability. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Map<String, List<Availability>> _groupByDate(List<Availability> slots) {
    final map = <String, List<Availability>>{};
    for (final slot in slots) {
      map.putIfAbsent(slot.availableDate, () => []).add(slot);
    }
    return map;
  }

  String _formatDate(String raw) {
    try {
      final date = DateTime.parse(raw);
      return DateFormat('EEE, d MMM yyyy').format(date);
    } catch (_) {
      return raw;
    }
  }

  DateTime? _selectedDate;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.doctor.fullName),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const LoadingView(message: 'Loading available sessions…');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    final slots = (_slots ?? []).where((s) => !s.isLeave).toList();
    
    // Filter slots
    final now = DateTime.now();
    final todayStr = now.toIso8601String().split('T')[0];
    
    final nextWeek = now.add(const Duration(days: 7));
    final nextWeekStr = nextWeek.toIso8601String().split('T')[0];
    
    final availableSlots = slots.where((s) {
      if (s.availableDate.compareTo(todayStr) < 0) return false;
      
      if (_selectedDate != null) {
        final selStr = _selectedDate!.toIso8601String().split('T')[0];
        return s.availableDate == selStr;
      }
      
      // Default to This Week
      return s.availableDate.compareTo(nextWeekStr) <= 0;
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  '${widget.doctor.specialization ?? ''} · ${widget.clinic.clinicName}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_selectedDate != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 8.0),
                      child: ActionChip(
                        label: Text(_formatDate(_selectedDate!.toIso8601String().split('T')[0])),
                        onPressed: () => setState(() => _selectedDate = null),
                        avatar: const Icon(Icons.clear, size: 16),
                        backgroundColor: AppColors.primary.withValues(alpha: 0.1),
                        side: BorderSide.none,
                      ),
                    ),
                  IconButton(
                    icon: const Icon(Icons.calendar_month, color: AppColors.primary),
                    onPressed: () async {
                      final maxDateStr = widget.doctor.bookingVisibleUntil;
                      DateTime maxDate = now.add(const Duration(days: 30));
                      if (maxDateStr != null && maxDateStr.isNotEmpty) {
                        try {
                          final parsedMax = DateTime.parse(maxDateStr.split('T')[0]);
                          if (parsedMax.isAfter(now)) {
                            maxDate = parsedMax;
                          } else {
                            maxDate = now;
                          }
                        } catch (_) {}
                      }

                      final picked = await showDatePicker(
                        context: context,
                        initialDate: _selectedDate ?? now,
                        firstDate: now,
                        lastDate: maxDate,
                        builder: (context, child) {
                          return Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: const ColorScheme.light(
                                primary: AppColors.primary,
                                onPrimary: Colors.white,
                                onSurface: AppColors.textPrimary,
                              ),
                            ),
                            child: child!,
                          );
                        },
                      );
                      if (picked != null) {
                        setState(() => _selectedDate = picked);
                      }
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: availableSlots.isEmpty
              ? const EmptyState(
                  icon: Icons.event_busy_rounded,
                  title: 'No upcoming sessions',
                  subtitle: 'No available sessions for the selected period.',
                )
              : _buildList(availableSlots),
        ),
      ],
    );
  }

  Widget _buildList(List<Availability> availableSlots) {
    final grouped = _groupByDate(availableSlots);
    final dates = grouped.keys.toList()..sort();

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      children: [
        for (final date in dates) ...[
          Text(_formatDate(date), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 8),
          ...grouped[date]!.map(
            (slot) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                leading: Icon(
                  slot.session == 'Morning' ? Icons.wb_sunny_outlined : Icons.nights_stay_outlined,
                  color: AppColors.primary,
                ),
                title: Text('${slot.session} Session', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${slot.startTime} - ${slot.endTime}'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => TokenSelectScreen(
                        availability: slot,
                        doctor: widget.doctor,
                        clinic: widget.clinic,
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],
      ],
    );
  }
}
