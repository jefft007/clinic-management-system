import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A circular medical-cross logo badge used on the splash and login screens.
/// The cross is drawn as two overlapping rounded rectangles (one horizontal,
/// one vertical) inside a teal circle — clean, recognisable, no external assets needed.
class AppLogo extends StatelessWidget {
  final double size;
  const AppLogo({super.key, this.size = 56});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AppColors.primary,
        shape: BoxShape.circle,
      ),
      child: CustomPaint(
        painter: _CrossPainter(),
      ),
    );
  }
}

class _CrossPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;

    final w = size.width;
    final h = size.height;
    // Arm thickness: 28% of diameter; arm length: 60% of diameter
    final thickness = w * 0.28;
    final armLen = w * 0.60;
    final cx = w / 2;
    final cy = h / 2;
    final radius = thickness / 2;

    // Horizontal arm
    final hRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(cx, cy), width: armLen, height: thickness),
      Radius.circular(radius),
    );
    canvas.drawRRect(hRect, paint);

    // Vertical arm
    final vRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(cx, cy), width: thickness, height: armLen),
      Radius.circular(radius),
    );
    canvas.drawRRect(vRect, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
