import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../models/clinic.dart';
import '../../theme/app_theme.dart';
import 'clinic_detail_screen.dart';

class NearbyMapScreen extends StatelessWidget {
  final List<Clinic> clinics;
  final Position center;

  const NearbyMapScreen({super.key, required this.clinics, required this.center});

  @override
  Widget build(BuildContext context) {
    final withLocation = clinics.where((c) => c.latitude != null && c.longitude != null).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Nearby Clinics')),
      body: FlutterMap(
        options: MapOptions(
          initialCenter: LatLng(center.latitude, center.longitude),
          initialZoom: 12,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            userAgentPackageName: 'com.example.patient_app',
          ),
          MarkerLayer(
            markers: [
              Marker(
                point: LatLng(center.latitude, center.longitude),
                width: 40,
                height: 40,
                child: const Icon(Icons.my_location_rounded, color: Colors.blue, size: 30),
              ),
              ...withLocation.map(
                (clinic) => Marker(
                  point: LatLng(clinic.latitude!, clinic.longitude!),
                  width: 44,
                  height: 44,
                  child: GestureDetector(
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => ClinicDetailScreen(clinic: clinic)),
                      );
                    },
                    child: const Icon(Icons.location_on_rounded, color: AppColors.primary, size: 40),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
