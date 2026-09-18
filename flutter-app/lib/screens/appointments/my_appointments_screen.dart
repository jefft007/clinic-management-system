import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../models/appointment.dart';
import '../../services/patient_api.dart';
import '../../theme/app_theme.dart';
import '../../widgets/appointment_card.dart';
import '../../widgets/common.dart';
import 'appointment_detail_screen.dart';

class MyAppointmentsScreen extends StatefulWidget {
  const MyAppointmentsScreen({super.key});

  @override
  State<MyAppointmentsScreen> createState() => _MyAppointmentsScreenState();
}

class _MyAppointmentsScreenState extends State<MyAppointmentsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  List<Appointment>? _appointments;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final appointments = await PatientApi.myAppointments();
      if (!mounted) return;
      setState(() => _appointments = appointments);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load appointments. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Appointments'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [Tab(text: 'Upcoming'), Tab(text: 'Past')],
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const LoadingView();
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    final all = _appointments ?? [];
    final upcoming = all.where((a) => a.isUpcoming).toList();
    final past = all.where((a) => !a.isUpcoming).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: TabBarView(
        controller: _tabController,
        children: [
          _buildList(upcoming, 'No upcoming appointments', 'Book a visit from the Find Care tab'),
          _buildList(past, 'No past appointments', 'Your appointment history will show up here'),
        ],
      ),
    );
  }

  Widget _buildList(List<Appointment> items, String emptyTitle, String emptySubtitle) {
    if (items.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 60),
          EmptyState(icon: Icons.event_note_outlined, title: emptyTitle, subtitle: emptySubtitle),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      itemBuilder: (context, i) => AppointmentCard(
        appointment: items[i],
        onTap: () async {
          final refresh = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => AppointmentDetailScreen(appointment: items[i])),
          );
          if (refresh == true) {
            _load();
          }
        },
      ),
    );
  }
}
