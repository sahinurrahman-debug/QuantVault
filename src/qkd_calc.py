"""Quantitative QKD Feasibility & Secret Key Rate Calculator.

Provides real physical modeling for point-to-point fibre links:
1. Optical Fibre Attenuation:
   eta_channel(L) = 10^(-alpha * L / 10)
   Default alpha = 0.20 dB/km (standard single-mode silica fibre at 1550 nm).

2. Decoy-State Secret Key Rate (SKR):
   Calculates secure bit rate R(L) in bit/s against distance L for a 1 GHz source.
   Accounts for detector dark counts, detector efficiency, and error correction leakage.

3. Trusted Relay & Deployment Recommendation:
   Determines maximum unrepeatered distance L_max (typically 90-120 km for InGaAs APDs).
   Ties directly into QuantVault risk engine to turn generic "evaluate QKD"
   recommendations into quantitative engineering verdicts.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any



def _binary_entropy(x: float) -> float:
    """Binary entropy in bits, kept local to avoid loading the QKD simulator."""
    if x <= 0.0 or x >= 1.0:
        return 0.0
    return -x * math.log2(x) - (1 - x) * math.log2(1 - x)


@dataclass
class QKDLinkParameters:
    distance_km: float = 40.0
    attenuation_db_per_km: float = 0.20     # Standard telecom fibre at 1550 nm
    rep_rate_hz: float = 1.0e9             # 1 GHz laser pulse rate
    detector_efficiency: float = 0.20       # Single-photon detector quantum efficiency (InGaAs)
    detector_dark_count: float = 1.0e-6     # Dark count probability per gate
    optical_error: float = 0.015            # 1.5% optical baseline error
    f_ec: float = 1.16                     # Cascade error correction efficiency factor
    mean_photon_mu: float = 0.50            # Signal state mean photon number
    mean_photon_nu: float = 0.10            # Decoy state mean photon number


@dataclass
class QKDLinkFeasibilityResult:
    distance_km: float
    channel_loss_db: float
    total_transmittance: float
    qber: float
    secret_key_rate_bps: float
    secret_key_rate_kbps: float
    max_unrepeatered_distance_km: float
    is_viable_unrepeatered: bool
    trusted_relays_needed: int
    recommendation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "distance_km": self.distance_km,
            "channel_loss_db": round(self.channel_loss_db, 2),
            "qber": round(self.qber, 4),
            "secret_key_rate_kbps": round(self.secret_key_rate_kbps, 2),
            "max_unrepeatered_km": round(self.max_unrepeatered_distance_km, 1),
            "is_viable": self.is_viable_unrepeatered,
            "trusted_relays_needed": self.trusted_relays_needed,
            "recommendation": self.recommendation,
        }


def calculate_qkd_rate(params: QKDLinkParameters, distance_km: float) -> tuple[float, float]:
    """Calculate (secret_key_rate_bps, qber) at distance_km."""
    loss_db = params.attenuation_db_per_km * distance_km
    trans_channel = 10.0 ** (-loss_db / 10.0)
    eta = params.detector_efficiency * trans_channel

    y0 = params.detector_dark_count
    mu, nu = params.mean_photon_mu, params.mean_photon_nu

    q_mu = y0 + 1.0 - math.exp(-eta * mu)
    q_nu = y0 + 1.0 - math.exp(-eta * nu)

    err_mu = 0.5 * y0 + params.optical_error * (1.0 - math.exp(-eta * mu))
    e_mu = err_mu / q_mu if q_mu > 0 else 0.5

    err_nu = 0.5 * y0 + params.optical_error * (1.0 - math.exp(-eta * nu))
    e_nu = err_nu / q_nu if q_nu > 0 else 0.5

    # Decoy single-photon yield Y1
    denom = mu * nu - nu**2
    num = q_nu * math.exp(nu) - q_mu * math.exp(mu) * ((nu / mu) ** 2) - ((mu**2 - nu**2) / (mu**2)) * y0
    y1 = max(0.0, num * (mu / denom))

    # Single-photon error e1
    e1_num = e_nu * q_nu * math.exp(nu) - 0.5 * y0
    e1 = min(0.5, max(0.0, e1_num / (y1 * nu))) if (y1 * nu) > 0 else 0.5

    q1 = y1 * mu * math.exp(-mu)
    r_pulse = 0.5 * max(0.0, q1 * (1.0 - _binary_entropy(e1)) - params.f_ec * q_mu * _binary_entropy(e_mu))
    skr_bps = params.rep_rate_hz * r_pulse

    return skr_bps, e_mu


def find_cutoff_distance(params: QKDLinkParameters) -> float:
    """Find the maximum distance (km) before secret key rate reaches zero."""
    for d in range(1, 250):
        rate, qber = calculate_qkd_rate(params, float(d))
        if rate <= 1.0 or qber > 0.11:
            return float(d - 1)
    return 120.0


def evaluate_link_feasibility(
    distance_km: float,
    params: QKDLinkParameters | None = None,
) -> QKDLinkFeasibilityResult:
    """Evaluate whether QKD is viable for a specific link length."""
    p = params or QKDLinkParameters()
    p.distance_km = distance_km

    loss_db = p.attenuation_db_per_km * distance_km
    skr_bps, qber = calculate_qkd_rate(p, distance_km)
    skr_kbps = skr_bps / 1000.0

    max_dist = find_cutoff_distance(p)
    is_viable = distance_km <= max_dist and skr_bps > 10.0

    if is_viable:
        relays = 0
        rec = f"VIABLE: QKD yields {skr_kbps:.1f} kbit/s secret key rate over {distance_km:g} km. Suitable for continuous symmetric key refresh."
    else:
        # Segment length approx 70 km
        segment_len = 70.0
        relays = max(1, math.ceil(distance_km / segment_len) - 1)
        rec = (
            f"INFEASIBLE DIRECT: Link distance ({distance_km:g} km) exceeds unrepeatered limit ({max_dist:.0f} km). "
            f"Requires {relays} trusted relay node(s) or post-quantum cryptography (ML-KEM-768)."
        )

    return QKDLinkFeasibilityResult(
        distance_km=distance_km,
        channel_loss_db=loss_db,
        total_transmittance=10.0 ** (-loss_db / 10.0) * p.detector_efficiency,
        qber=qber,
        secret_key_rate_bps=skr_bps,
        secret_key_rate_kbps=skr_kbps,
        max_unrepeatered_distance_km=max_dist,
        is_viable_unrepeatered=is_viable,
        trusted_relays_needed=relays,
        recommendation=rec,
    )
