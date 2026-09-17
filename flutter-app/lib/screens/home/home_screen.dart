import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import '../../models/clinic.dart';
import '../../services/patient_api.dart';
import '../../state/auth_state.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clinic_card.dart';
import '../../widgets/common.dart';
import 'clinic_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  // Place selection
  String? _selectedCity;
  List<String> _availableCities = [];
  bool _citiesLoaded = false;

  // Clinic list for selected city
  final _searchController = TextEditingController();
  Timer? _debounce;
  List<Clinic>? _clinics;
  bool _clinicsLoading = false;
  String? _clinicsError;

  @override
  void initState() {
    super.initState();
    _loadCities();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  // ─── City loading ──────────────────────────────────────────────────────────

  Future<void> _loadCities() async {
    try {
      final all = await PatientApi.searchClinics();
      if (!mounted) return;
      final cities = all
          .map((c) => c.city.trim())
          .where((c) => c.isNotEmpty)
          .toSet()
          .toList()
        ..sort();
      setState(() {
        _availableCities = cities;
        _citiesLoaded = true;
      });

      // Auto-select last city if available
      final lastCity = context.read<AuthState>().lastCity;
      if (lastCity != null && cities.contains(lastCity) && _selectedCity == null) {
        _selectCity(lastCity);
      }
    } catch (_) {
      if (mounted) setState(() => _citiesLoaded = true);
    }
  }

  void _selectCity(String city) {
    setState(() {
      _selectedCity = city;
      _searchController.clear();
      _clinics = null;
      _clinicsError = null;
    });
    context.read<AuthState>().saveLastCity(city);
    _loadClinics(city: city);
  }

  // ─── Clinic loading ────────────────────────────────────────────────────────

  Future<void> _loadClinics({required String city, String? nameQuery}) async {
    setState(() {
      _clinicsLoading = true;
      _clinicsError = null;
    });
    try {
      // Search by city (search param matches city field in backend)
      final results = await PatientApi.searchClinics(
        search: nameQuery != null && nameQuery.isNotEmpty ? nameQuery : null,
        city: city,
      );
      if (!mounted) return;
      setState(() => _clinics = results);
    } on ApiException catch (e) {
      if (mounted) setState(() => _clinicsError = e.message);
    } catch (_) {
      if (mounted) setState(() => _clinicsError = 'Could not load clinics. Check your connection.');
    } finally {
      if (mounted) setState(() => _clinicsLoading = false);
    }
  }

  void _onSearchChanged(String value) {
    if (_selectedCity == null) return;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _loadClinics(city: _selectedCity!, nameQuery: value.trim());
    });
  }

  void _openClinic(Clinic clinic) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ClinicDetailScreen(clinic: clinic)),
    );
  }

  // ─── Greeting ──────────────────────────────────────────────────────────────

  String _greetingPrefix() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final firstName = (auth.name ?? 'there').split(' ').first;

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            // ── Greeting header ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_greetingPrefix()}, $firstName! 👋',
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Find a clinic or hospital near you.',
                      style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            ),

            // ── Place selector ──
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _PlaceSelector(
                  selectedCity: _selectedCity,
                  availableCities: _availableCities,
                  lastCity: auth.lastCity,
                  citiesLoaded: _citiesLoaded,
                  onCitySelected: _selectCity,
                  onClear: () => setState(() {
                    _selectedCity = null;
                    _clinics = null;
                    _clinicsError = null;
                    _searchController.clear();
                  }),
                ),
              ),
            ),

            // ── Content area (only when city selected) ──
            if (_selectedCity == null) ...[
              SliverFillRemaining(
                child: _buildPlacePrompt(),
              ),
            ] else ...[
              // Search bar
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: TextField(
                    controller: _searchController,
                    onChanged: _onSearchChanged,
                    decoration: InputDecoration(
                      hintText: 'Search hospitals or clinics in $_selectedCity…',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                _loadClinics(city: _selectedCity!);
                              },
                            )
                          : null,
                    ),
                  ),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 12)),
              // Clinic list
              _buildClinicSliver(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildPlacePrompt() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.08),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.location_city_rounded, color: AppColors.primary, size: 38),
          ),
          const SizedBox(height: 16),
          const Text(
            'Select your place',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.textPrimary),
          ),
          const SizedBox(height: 6),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 40),
            child: Text(
              'Choose a city or town above to see nearby clinics and hospitals.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClinicSliver() {
    if (_clinicsLoading) {
      return const SliverFillRemaining(
        child: LoadingView(message: 'Loading clinics…'),
      );
    }
    if (_clinicsError != null) {
      return SliverFillRemaining(
        child: ErrorView(
          message: _clinicsError!,
          onRetry: () => _loadClinics(city: _selectedCity!, nameQuery: _searchController.text.trim()),
        ),
      );
    }
    final list = _clinics ?? [];
    if (list.isEmpty) {
      return SliverFillRemaining(
        child: EmptyState(
          icon: Icons.local_hospital_outlined,
          title: 'No clinics found',
          subtitle: _searchController.text.isNotEmpty
              ? 'Try a different name'
              : 'No clinics listed for $_selectedCity yet',
        ),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      sliver: SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, i) => ClinicCard(
            clinic: list[i],
            onTap: () => _openClinic(list[i]),
          ),
          childCount: list.length,
        ),
      ),
    );
  }
}

// ─── Place selector widget ─────────────────────────────────────────────────────

class _PlaceSelector extends StatelessWidget {
  final String? selectedCity;
  final List<String> availableCities;
  final String? lastCity;
  final bool citiesLoaded;
  final ValueChanged<String> onCitySelected;
  final VoidCallback onClear;

  const _PlaceSelector({
    required this.selectedCity,
    required this.availableCities,
    required this.lastCity,
    required this.citiesLoaded,
    required this.onCitySelected,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showCityPicker(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selectedCity != null ? AppColors.primary : AppColors.border,
            width: selectedCity != null ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.location_on_rounded,
              size: 20,
              color: selectedCity != null ? AppColors.primary : AppColors.textSecondary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                selectedCity ?? 'Select your place / city',
                style: TextStyle(
                  color: selectedCity != null ? AppColors.textPrimary : AppColors.textSecondary,
                  fontWeight: selectedCity != null ? FontWeight.w600 : FontWeight.normal,
                  fontSize: 15,
                ),
              ),
            ),
            if (selectedCity != null)
              GestureDetector(
                onTap: onClear,
                child: const Icon(Icons.close_rounded, size: 18, color: AppColors.textSecondary),
              )
            else
              const Icon(Icons.keyboard_arrow_down_rounded, size: 22, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
  }

  void _showCityPicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CityPickerSheet(
        cities: availableCities,
        lastCity: lastCity,
        onSelected: (city) {
          Navigator.pop(context);
          onCitySelected(city);
        },
      ),
    );
  }
}

// ─── City picker bottom sheet ──────────────────────────────────────────────────

class _CityPickerSheet extends StatefulWidget {
  final List<String> cities;
  final String? lastCity;
  final ValueChanged<String> onSelected;

  const _CityPickerSheet({
    required this.cities,
    required this.lastCity,
    required this.onSelected,
  });

  @override
  State<_CityPickerSheet> createState() => _CityPickerSheetState();
}

class _CityPickerSheetState extends State<_CityPickerSheet> {
  final _controller = TextEditingController();
  List<String> _filtered = [];

  @override
  void initState() {
    super.initState();
    _filtered = widget.cities;
    _controller.addListener(() {
      final q = _controller.text.trim().toLowerCase();
      setState(() {
        _filtered = q.isEmpty
            ? widget.cities
            : widget.cities.where((c) => c.toLowerCase().contains(q)).toList();
      });
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final maxHeight = MediaQuery.of(context).size.height * 0.75;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Container(
              margin: const EdgeInsets.symmetric(vertical: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const Text(
              'Select Place',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            // Search
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _controller,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search city or town…',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Recommended banner
            if (widget.lastCity != null && _filtered.contains(widget.lastCity!))
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: _CityTile(
                  city: widget.lastCity!,
                  badge: 'Recommended',
                  onTap: () => widget.onSelected(widget.lastCity!),
                ),
              ),

            const Divider(height: 1),

            Flexible(
              child: _filtered.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('No cities found', style: TextStyle(color: AppColors.textSecondary)),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      itemCount: _filtered.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, indent: 56),
                      itemBuilder: (_, i) => _CityTile(
                        city: _filtered[i],
                        onTap: () => widget.onSelected(_filtered[i]),
                      ),
                    ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _CityTile extends StatelessWidget {
  final String city;
  final String? badge;
  final VoidCallback onTap;

  const _CityTile({required this.city, this.badge, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: const Icon(Icons.location_city_rounded, color: AppColors.primary, size: 22),
      title: Text(city, style: const TextStyle(fontWeight: FontWeight.w500)),
      trailing: badge != null
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badge!,
                style: const TextStyle(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w700),
              ),
            )
          : null,
      onTap: onTap,
    );
  }
}
