import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api_client.dart';
import '../../models/clinic.dart';
import '../../services/patient_api.dart';
import '../../theme/app_theme.dart';
import '../../widgets/clinic_card.dart';
import '../../widgets/common.dart';
import 'clinic_detail_screen.dart';
import 'nearby_map_screen.dart';

class FindClinicsScreen extends StatefulWidget {
  const FindClinicsScreen({super.key});

  @override
  State<FindClinicsScreen> createState() => _FindClinicsScreenState();
}

enum _Mode { search, nearby }

class _FindClinicsScreenState extends State<FindClinicsScreen> {
  _Mode _mode = _Mode.search;

  // Search mode state
  final _searchController = TextEditingController();
  Timer? _debounce;
  List<Clinic>? _searchResults;
  bool _searchLoading = true;
  String? _searchError;

  // Nearby mode state
  List<Clinic>? _nearbyResults;
  bool _nearbyLoading = false;
  String? _nearbyError;
  Position? _position;

  @override
  void initState() {
    super.initState();
    _loadAllClinics();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadAllClinics({String? query}) async {
    setState(() {
      _searchLoading = true;
      _searchError = null;
    });
    try {
      final clinics = await PatientApi.searchClinics(search: query);
      if (!mounted) return;
      setState(() => _searchResults = clinics);
    } on ApiException catch (e) {
      if (mounted) setState(() => _searchError = e.message);
    } catch (_) {
      if (mounted) setState(() => _searchError = 'Could not load clinics. Check your connection.');
    } finally {
      if (mounted) setState(() => _searchLoading = false);
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _loadAllClinics(query: value.trim().isEmpty ? null : value.trim());
    });
  }

  Future<void> _loadNearby() async {
    setState(() {
      _nearbyLoading = true;
      _nearbyError = null;
    });
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        throw 'Please turn on location services to find clinics near you';
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw 'Location permission is needed to show nearby clinics';
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium),
      );
      final clinics = await PatientApi.nearbyClinics(
        lat: position.latitude,
        lng: position.longitude,
      );
      if (!mounted) return;
      setState(() {
        _position = position;
        _nearbyResults = clinics;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _nearbyError = e.message);
    } catch (e) {
      if (mounted) setState(() => _nearbyError = e.toString());
    } finally {
      if (mounted) setState(() => _nearbyLoading = false);
    }
  }

  void _openClinic(Clinic clinic) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ClinicDetailScreen(clinic: clinic)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find Care'),
        actions: [
          if (_mode == _Mode.nearby && _nearbyResults != null && _nearbyResults!.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.map_outlined),
              tooltip: 'View on map',
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => NearbyMapScreen(
                      clinics: _nearbyResults!,
                      center: _position!,
                    ),
                  ),
                );
              },
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: _ModeChip(
                    label: 'Search',
                    icon: Icons.search_rounded,
                    selected: _mode == _Mode.search,
                    onTap: () => setState(() => _mode = _Mode.search),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _ModeChip(
                    label: 'Nearby',
                    icon: Icons.near_me_rounded,
                    selected: _mode == _Mode.nearby,
                    onTap: () {
                      setState(() => _mode = _Mode.nearby);
                      if (_nearbyResults == null && !_nearbyLoading) _loadNearby();
                    },
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _mode == _Mode.search ? _buildSearchTab() : _buildNearbyTab(),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: TextField(
            controller: _searchController,
            onChanged: _onSearchChanged,
            decoration: const InputDecoration(
              hintText: 'Search hospitals, clinics, places…',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
        ),
        Expanded(child: _buildSearchResults()),
      ],
    );
  }

  Widget _buildSearchResults() {
    if (_searchLoading) return const LoadingView();
    if (_searchError != null) {
      return ErrorView(message: _searchError!, onRetry: () => _loadAllClinics());
    }
    final results = _searchResults ?? [];
    if (results.isEmpty) {
      return const EmptyState(
        icon: Icons.local_hospital_outlined,
        title: 'No clinics found',
        subtitle: 'Try a different name or place',
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      itemCount: results.length,
      itemBuilder: (context, i) => ClinicCard(clinic: results[i], onTap: () => _openClinic(results[i])),
    );
  }

  Widget _buildNearbyTab() {
    if (_nearbyLoading) return const LoadingView(message: 'Finding clinics near you…');
    if (_nearbyError != null) {
      return ErrorView(message: _nearbyError!, onRetry: _loadNearby);
    }
    final results = _nearbyResults ?? [];
    if (results.isEmpty) {
      return EmptyState(
        icon: Icons.location_searching_rounded,
        title: 'No clinics found nearby',
        subtitle: 'Try widening the area or use Search instead',
        action: OutlinedButton(onPressed: _loadNearby, child: const Text('Refresh')),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      itemCount: results.length,
      itemBuilder: (context, i) => ClinicCard(clinic: results[i], onTap: () => _openClinic(results[i])),
    );
  }
}

class _ModeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ModeChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: selected ? Colors.white : AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : AppColors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
