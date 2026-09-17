import 'package:flutter/material.dart';
import '../models/availability.dart';
import '../theme/app_theme.dart';

class TokenGridWidget extends StatelessWidget {
  final List<TokenDetail> tokens;
  final int? selectedTokenNumber;
  final ValueChanged<TokenDetail> onSelect;

  const TokenGridWidget({
    super.key,
    required this.tokens,
    required this.selectedTokenNumber,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Legend
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              _LegendItem(label: 'Available', color: Colors.white, borderColor: Color(0xFF15803D)),
              _LegendItem(label: 'Selected', color: Color(0xFF2563EB), borderColor: Color(0xFF1D4ED8)),
              _LegendItem(label: 'Unavailable', color: Color(0xFF6B7280), borderColor: Color(0xFF4B5563)),
            ],
          ),
        ),
        
        // Grid
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 5,
              mainAxisSpacing: 12,
              crossAxisSpacing: 10,
              childAspectRatio: 0.75,
            ),
            itemCount: tokens.length,
            itemBuilder: (context, index) {
              final token = tokens[index];
              final isBookable = token.isAvailable == true && token.bookingSource == 'online';
              final isSelected = selectedTokenNumber == token.tokenNumber;

              return _SquareSeatTile(
                detail: token,
                isSelected: isSelected,
                isBookable: isBookable,
                onTap: isBookable ? () => onSelect(token) : null,
              );
            },
          ),
        ),
      ],
    );
  }
}

class _SquareSeatTile extends StatelessWidget {
  final TokenDetail detail;
  final bool isSelected;
  final bool isBookable;
  final VoidCallback? onTap;

  const _SquareSeatTile({
    required this.detail,
    required this.isSelected,
    required this.isBookable,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    String timeStr = '';
    if (detail.estimatedStartTime != null) {
      timeStr = detail.estimatedTimeLabel?.split(' - ').first ?? detail.estimatedStartTime!;
    } else if (detail.estimatedTimeLabel != null) {
      timeStr = detail.estimatedTimeLabel!.split(' - ').first;
    }

    Color bgColor;
    Color borderColor;
    Color textColor;

    if (isSelected) {
      bgColor = const Color(0xFF2563EB);
      borderColor = const Color(0xFF1D4ED8);
      textColor = Colors.white;
    } else if (isBookable) {
      bgColor = Colors.white;
      borderColor = const Color(0xFF15803D);
      textColor = const Color(0xFF0F172A);
    } else {
      // For any token that the patient can't book (already booked, blocked, walk-in)
      if (detail.status == 'Booked') {
        bgColor = const Color(0xFF15803D);
        borderColor = const Color(0xFF166534);
        textColor = Colors.white;
      } else {
        bgColor = const Color(0xFF6B7280);
        borderColor = const Color(0xFF4B5563);
        textColor = Colors.white;
      }
    }

    return Column(
      children: [
        if (timeStr.isNotEmpty)
          Text(
            timeStr,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: isSelected ? AppColors.primary : AppColors.textSecondary,
            ),
          )
        else
          const SizedBox(height: 15),
          
        const SizedBox(height: 4),
        Expanded(
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(6),
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: borderColor, width: 2),
                boxShadow: isBookable && !isSelected ? [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 2, offset: const Offset(0, 1))
                ] : null,
              ),
              child: Center(
                child: Text(
                  '${detail.tokenNumber}',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: textColor,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _LegendItem extends StatelessWidget {
  final String label;
  final Color color;
  final Color borderColor;

  const _LegendItem({
    required this.label,
    required this.color,
    required this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            border: Border.all(color: borderColor, width: 2),
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textSecondary),
        ),
      ],
    );
  }
}
