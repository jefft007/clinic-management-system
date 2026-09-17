import 'package:flutter/material.dart';
import '../../core/api_client.dart';
import '../../models/availability.dart';
import '../../models/clinic.dart';
import '../../models/doctor.dart';
import '../../theme/app_theme.dart';
import '../../services/patient_api.dart';
import '../../widgets/common.dart';
import '../../widgets/token_grid_widget.dart';
import 'booking_form_screen.dart';

class TokenSelectScreen extends StatefulWidget {
  final Availability availability;
  final Doctor doctor;
  final Clinic clinic;

  const TokenSelectScreen({
    super.key,
    required this.availability,
    required this.doctor,
    required this.clinic,
  });

  @override
  State<TokenSelectScreen> createState() => _TokenSelectScreenState();
}

class _TokenSelectScreenState extends State<TokenSelectScreen> {
  int _totalTokens = 0;
  List<TokenDetail>? _tokens;
  bool _loading = true;
  String? _error;
  TokenDetail? _selected;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _selected = null;
    });
    try {
      final result = await PatientApi.availabilityTokens(widget.availability.availabilityId);
      if (!mounted) return;
      setState(() {
        _totalTokens = result.total;
        _tokens = result.tokens;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not load tokens. Check your connection.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Select a Token')),
      body: _buildBody(),
      bottomNavigationBar: _selected == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => BookingFormScreen(
                          availability: widget.availability,
                          doctor: widget.doctor,
                          clinic: widget.clinic,
                          token: _selected!,
                        ),
                      ),
                    );
                  },
                  child: Text('Continue with Token #${_selected!.tokenNumber}'),
                ),
              ),
            ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const LoadingView(message: 'Loading available tokens…');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);

    final tokens = _tokens ?? [];
    // Even if tokens is empty, we should still show the grid if there are total tokens
    // but typically if no tokens are available we show empty state.
    if (_totalTokens == 0) {
      return const EmptyState(
        icon: Icons.event_busy_rounded,
        title: 'No tokens available',
        subtitle: 'This session has no valid tokens configured.',
      );
    }

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          color: AppColors.primary.withValues(alpha: 0.06),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${widget.doctor.fullName} · ${widget.availability.session} Session',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
              ),
              const SizedBox(height: 2),
              Text(
                widget.availability.availableDate,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: TokenGridWidget(
            tokens: tokens,
            selectedTokenNumber: _selected?.tokenNumber,
            onSelect: (token) => setState(() => _selected = token),
          ),
        ),
        if (_selected?.estimatedTimeLabel != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.schedule_rounded, color: AppColors.primary, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${_selected!.estimatedTimeLabel!.split(' - ').first} · arrive by ${_selected!.arriveByLabel}',
                      style: const TextStyle(fontSize: 12, color: AppColors.primaryDark, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

