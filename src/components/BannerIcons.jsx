/**
 * BannerIcons.jsx
 * Central registry of colourful SVG icons for PageBanner main circles,
 * plus a keyword-based step-emoji auto-assigner for the bottom strip.
 *
 * Usage (inside PageBanner — automatic, no form files need changing):
 *   import { getBannerIcon, getStepEmoji } from './BannerIcons'
 *   const icon = getBannerIcon(iconLabel, L3)   // returns JSX or null
 *   const emoji = getStepEmoji(stepName)         // returns emoji string
 */

import React from 'react'

/* ─── MAIN CIRCLE ICONS ─────────────────────────────────────────────────────
   Each function receives `color` (the chapter L3 hex) so badges / accents
   blend into the chapter palette.                                            */

const EmployeeIcon = ({ color }) => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* suit body */}
    <ellipse cx="40" cy="63" rx="22" ry="14" fill="#2c5f8a"/>
    {/* tie */}
    <polygon points="40,52 37,58 40,70 43,58" fill="#c0392b"/>
    {/* collar */}
    <polygon points="40,52 34,56 36,52" fill="white"/>
    <polygon points="40,52 46,56 44,52" fill="white"/>
    {/* head */}
    <circle cx="40" cy="34" r="14" fill="#f4a460"/>
    {/* hair */}
    <ellipse cx="40" cy="23" rx="13" ry="6" fill="#5c3317"/>
    {/* gear badge */}
    <circle cx="58" cy="56" r="13" fill="#e67e22"/>
    <circle cx="58" cy="56" r="7" fill="white" opacity="0.9"/>
    <rect x="56.5" y="43" width="3" height="4" rx="1" fill="#e67e22"/>
    <rect x="56.5" y="65" width="3" height="4" rx="1" fill="#e67e22"/>
    <rect x="45" y="54.5" width="4" height="3" rx="1" fill="#e67e22"/>
    <rect x="67" y="54.5" width="4" height="3" rx="1" fill="#e67e22"/>
    <rect x="49" y="47" width="3" height="4" rx="1" fill="#e67e22" transform="rotate(45 50.5 49)"/>
    <rect x="65" y="61" width="3" height="4" rx="1" fill="#e67e22" transform="rotate(45 66.5 63)"/>
    {/* mini person in gear */}
    <circle cx="58" cy="53" r="3" fill="#795338"/>
    <ellipse cx="58" cy="61" rx="4" ry="3" fill="#2c5f8a"/>
  </svg>
)

const VehicleIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="8" y="42" width="64" height="20" rx="4" fill="#2980b9"/>
    <path d="M20 42 L28 26 L52 26 L60 42 Z" fill="#3498db"/>
    <path d="M30 42 L35 30 L45 30 L50 42 Z" fill="#aed6f1" opacity="0.9"/>
    <rect x="22" y="30" width="8" height="10" rx="1" fill="#aed6f1" opacity="0.8"/>
    <rect x="50" y="30" width="8" height="10" rx="1" fill="#aed6f1" opacity="0.8"/>
    <circle cx="22" cy="62" r="10" fill="#1a252f"/>
    <circle cx="22" cy="62" r="6" fill="#808b96"/>
    <circle cx="22" cy="62" r="2.5" fill="#abebc6"/>
    <circle cx="58" cy="62" r="10" fill="#1a252f"/>
    <circle cx="58" cy="62" r="6" fill="#808b96"/>
    <circle cx="58" cy="62" r="2.5" fill="#abebc6"/>
    <rect x="8" y="47" width="6" height="4" rx="1" fill="#f9e79f"/>
    <rect x="66" y="47" width="6" height="4" rx="1" fill="#f9e79f"/>
    <line x1="40" y1="42" x2="40" y2="62" stroke="white" strokeWidth="1" opacity="0.4"/>
    <rect x="28" y="50" width="6" height="2" rx="1" fill="white" opacity="0.6"/>
    <rect x="46" y="50" width="6" height="2" rx="1" fill="white" opacity="0.6"/>
  </svg>
)

const ContractIcon = ({ color }) => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="14" y="8" width="42" height="54" rx="3" fill="white" opacity="0.95"/>
    <path d="M44 8 L56 20 L44 20 Z" fill="#85c1e9"/>
    <rect x="20" y="26" width="28" height="3" rx="1.5" fill="#2980b9"/>
    <rect x="20" y="33" width="22" height="2.5" rx="1.25" fill="#85c1e9"/>
    <rect x="20" y="39" width="26" height="2.5" rx="1.25" fill="#85c1e9"/>
    <rect x="20" y="45" width="18" height="2.5" rx="1.25" fill="#85c1e9"/>
    <line x1="20" y1="54" x2="40" y2="54" stroke="#2980b9" strokeWidth="1.5"/>
    {/* pen */}
    <rect x="48" y="46" width="6" height="22" rx="2" fill="#f39c12" transform="rotate(-35 51 57)"/>
    <polygon points="48,66 52,70 46,68" fill="#e67e22" transform="rotate(-35 49 68)"/>
    <rect x="48" y="46" width="6" height="4" rx="1" fill="#c0392b" transform="rotate(-35 51 48)"/>
    {/* stamp */}
    <circle cx="52" cy="30" r="11" fill="#27ae60" opacity="0.9"/>
    <text x="52" y="34" textAnchor="middle" fontSize="8" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">LOI</text>
  </svg>
)

const PurchaseOrderIcon = ({ color }) => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="12" y="16" width="46" height="56" rx="3" fill="white" opacity="0.95"/>
    <rect x="28" y="10" width="14" height="12" rx="3" fill="#117a65"/>
    <rect x="31" y="12" width="8" height="6" rx="2" fill="white" opacity="0.8"/>
    <rect x="18" y="32" width="34" height="3" rx="1.5" fill="#1e8449"/>
    <rect x="18" y="38" width="20" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="40" y="38" width="12" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="18" y="43" width="20" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="40" y="43" width="12" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="18" y="48" width="20" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="40" y="48" width="12" height="2" rx="1" fill="#a9dfbf"/>
    <rect x="18" y="55" width="34" height="10" rx="2" fill="#1e8449"/>
    <text x="35" y="63" textAnchor="middle" fontSize="8" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">TOTAL</text>
    <circle cx="62" cy="20" r="10" fill="#f39c12"/>
    <text x="62" y="24" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">SAR</text>
  </svg>
)

const FixedAssetIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="14" y="30" width="52" height="38" rx="2" fill="white" opacity="0.95"/>
    <polygon points="10,32 40,10 70,32" fill="#c0392b"/>
    <rect x="20" y="38" width="10" height="10" rx="1" fill="#85c1e9"/>
    <rect x="35" y="38" width="10" height="10" rx="1" fill="#85c1e9"/>
    <rect x="50" y="38" width="10" height="10" rx="1" fill="#85c1e9"/>
    <rect x="33" y="54" width="14" height="14" rx="1" fill="#8e6c40"/>
    <circle cx="44" cy="61" r="1.5" fill="#f0d060"/>
    <circle cx="62" cy="22" r="11" fill="#e67e22"/>
    <text x="62" y="26" textAnchor="middle" fontSize="12" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">↓%</text>
  </svg>
)

const MoneyRequestIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="10" y="24" width="50" height="36" rx="4" fill="white" opacity="0.95"/>
    <rect x="10" y="24" width="50" height="10" rx="4" fill="#c0392b" opacity="0.8"/>
    <rect x="46" y="30" width="18" height="22" rx="10" fill="#f9e79f" stroke="#e67e22" strokeWidth="1.5"/>
    <circle cx="55" cy="41" r="6" fill="#f39c12"/>
    <text x="55" y="45" textAnchor="middle" fontSize="9" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">$</text>
    <rect x="14" y="37" width="28" height="4" rx="2" fill="#a9dfbf"/>
    <rect x="14" y="43" width="22" height="4" rx="2" fill="#a9dfbf"/>
    <circle cx="62" cy="18" r="8" fill="#f1c40f"/>
    <text x="62" y="22" textAnchor="middle" fontSize="9" fontWeight="900" fill="#7d6608" fontFamily="Poppins,sans-serif">$</text>
    <circle cx="20" cy="14" r="6" fill="#f1c40f"/>
    <text x="20" y="18" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7d6608" fontFamily="Poppins,sans-serif">$</text>
  </svg>
)

const PayrollIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="16" y="10" width="38" height="52" rx="4" fill="white" opacity="0.95"/>
    <rect x="16" y="10" width="38" height="16" rx="4" fill="#2ecc71" opacity="0.9"/>
    <text x="35" y="23" textAnchor="middle" fontSize="9" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">SAR</text>
    <rect x="21" y="32" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="32" y="32" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="43" y="32" width="8" height="6" rx="1.5" fill="#e74c3c"/>
    <rect x="21" y="41" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="32" y="41" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="43" y="41" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="21" y="50" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="32" y="50" width="8" height="6" rx="1.5" fill="#a9dfbf"/>
    <rect x="43" y="50" width="8" height="6" rx="1.5" fill="#2ecc71"/>
    <circle cx="62" cy="22" r="12" fill="#27ae60"/>
    <polyline points="54,27 58,22 62,25 68,17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
)

const ExpenseIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="18" y="8" width="36" height="52" rx="2" fill="white" opacity="0.95"/>
    <path d="M18 60 L22 56 L26 60 L30 56 L34 60 L38 56 L42 60 L46 56 L50 60 L54 56 L54 60 Z" fill="white" opacity="0.95"/>
    <rect x="22" y="14" width="28" height="3" rx="1.5" fill="#6c5ce7"/>
    <rect x="22" y="20" width="16" height="2" rx="1" fill="#b2bec3"/>
    <rect x="40" y="20" width="10" height="2" rx="1" fill="#b2bec3"/>
    <rect x="22" y="25" width="16" height="2" rx="1" fill="#b2bec3"/>
    <rect x="40" y="25" width="10" height="2" rx="1" fill="#b2bec3"/>
    <rect x="22" y="30" width="16" height="2" rx="1" fill="#b2bec3"/>
    <rect x="40" y="30" width="10" height="2" rx="1" fill="#b2bec3"/>
    <line x1="22" y1="37" x2="50" y2="37" stroke="#b2bec3" strokeWidth="0.8" strokeDasharray="2,2"/>
    <rect x="22" y="40" width="12" height="3" rx="1.5" fill="#6c5ce7"/>
    <rect x="38" y="40" width="12" height="3" rx="1.5" fill="#e17055"/>
    <circle cx="62" cy="20" r="12" fill="#fdcb6e"/>
    <rect x="55" y="15" width="14" height="10" rx="2" fill="#2d3436"/>
    <circle cx="62" cy="20" r="4" fill="#74b9ff"/>
    <circle cx="62" cy="20" r="2" fill="white"/>
  </svg>
)

const InvoiceIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="10" y="10" width="44" height="56" rx="3" fill="white" opacity="0.95"/>
    <rect x="10" y="10" width="44" height="14" rx="3" fill="#2980b9" opacity="0.9"/>
    <text x="32" y="22" textAnchor="middle" fontSize="8" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">INVOICE</text>
    <rect x="16" y="30" width="20" height="2" rx="1" fill="#85c1e9"/>
    <rect x="38" y="30" width="10" height="2" rx="1" fill="#2980b9"/>
    <rect x="16" y="35" width="20" height="2" rx="1" fill="#85c1e9"/>
    <rect x="38" y="35" width="10" height="2" rx="1" fill="#85c1e9"/>
    <rect x="16" y="40" width="20" height="2" rx="1" fill="#85c1e9"/>
    <rect x="38" y="40" width="10" height="2" rx="1" fill="#85c1e9"/>
    <line x1="16" y1="47" x2="48" y2="47" stroke="#85c1e9" strokeWidth="0.8"/>
    <rect x="16" y="50" width="14" height="3" rx="1.5" fill="#2980b9"/>
    <rect x="34" y="50" width="14" height="3" rx="1.5" fill="#e74c3c"/>
    <circle cx="66" cy="22" r="12" fill="#27ae60"/>
    <text x="66" y="26" textAnchor="middle" fontSize="10" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">✓</text>
  </svg>
)

const ProjectIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* hard hat */}
    <ellipse cx="40" cy="36" rx="26" ry="14" fill="#f39c12"/>
    <rect x="14" y="36" width="52" height="8" rx="2" fill="#e67e22"/>
    {/* brim */}
    <ellipse cx="40" cy="44" rx="30" ry="5" fill="#d35400"/>
    {/* site */}
    <rect x="20" y="50" width="40" height="18" rx="2" fill="white" opacity="0.9"/>
    <rect x="24" y="54" width="8" height="10" rx="1" fill="#85c1e9"/>
    <rect x="36" y="54" width="8" height="10" rx="1" fill="#85c1e9"/>
    <rect x="48" y="54" width="8" height="6" rx="1" fill="#85c1e9"/>
    {/* crane badge */}
    <circle cx="64" cy="20" r="12" fill="#e74c3c"/>
    <line x1="58" y1="26" x2="70" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <line x1="64" y1="14" x2="70" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <line x1="70" y1="14" x2="70" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const BankIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* building */}
    <rect x="10" y="30" width="60" height="38" rx="2" fill="white" opacity="0.95"/>
    {/* roof */}
    <polygon points="6,32 40,8 74,32" fill="#2980b9"/>
    {/* columns */}
    <rect x="16" y="38" width="6" height="22" rx="1" fill="#85c1e9"/>
    <rect x="27" y="38" width="6" height="22" rx="1" fill="#85c1e9"/>
    <rect x="38" y="38" width="6" height="22" rx="1" fill="#85c1e9"/>
    <rect x="49" y="38" width="6" height="22" rx="1" fill="#85c1e9"/>
    <rect x="60" y="38" width="6" height="22" rx="1" fill="#85c1e9"/>
    <rect x="10" y="60" width="60" height="6" rx="1" fill="#2980b9"/>
    {/* coin */}
    <circle cx="62" cy="20" r="10" fill="#f1c40f"/>
    <text x="62" y="24" textAnchor="middle" fontSize="10" fontWeight="900" fill="#7d6608" fontFamily="Poppins,sans-serif">$</text>
  </svg>
)

const InsuranceIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* shield */}
    <path d="M40 8 L66 20 L66 46 C66 58 40 72 40 72 C40 72 14 58 14 46 L14 20 Z" fill="#2980b9"/>
    <path d="M40 14 L60 24 L60 46 C60 55 40 66 40 66 C40 66 20 55 20 46 L20 24 Z" fill="white" opacity="0.95"/>
    {/* checkmark */}
    <path d="M28 42 L36 50 L52 32" stroke="#27ae60" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    {/* badge */}
    <circle cx="62" cy="20" r="12" fill="#e74c3c"/>
    <text x="62" y="24" textAnchor="middle" fontSize="9" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">+</text>
  </svg>
)

const IqamaIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* ID card */}
    <rect x="8" y="18" width="52" height="38" rx="4" fill="white" opacity="0.95"/>
    <rect x="8" y="18" width="52" height="12" rx="4" fill="#2980b9"/>
    <text x="34" y="28" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">IQAMA</text>
    {/* photo */}
    <rect x="14" y="34" width="14" height="16" rx="2" fill="#85c1e9"/>
    <circle cx="21" cy="38" r="4" fill="#2980b9" opacity="0.6"/>
    <ellipse cx="21" cy="47" rx="6" ry="4" fill="#2980b9" opacity="0.6"/>
    {/* lines */}
    <rect x="32" y="34" width="22" height="2.5" rx="1.25" fill="#2980b9"/>
    <rect x="32" y="39" width="16" height="2" rx="1" fill="#85c1e9"/>
    <rect x="32" y="43" width="18" height="2" rx="1" fill="#85c1e9"/>
    <rect x="32" y="47" width="12" height="2" rx="1" fill="#85c1e9"/>
    {/* QR badge */}
    <circle cx="66" cy="62" r="12" fill="#2d3436"/>
    <rect x="60" y="56" width="5" height="5" rx="0.5" fill="white"/>
    <rect x="67" y="56" width="5" height="5" rx="0.5" fill="white"/>
    <rect x="60" y="63" width="5" height="5" rx="0.5" fill="white"/>
    <rect x="67" y="63" width="2" height="2" fill="white"/>
    <rect x="70" y="66" width="2" height="2" fill="white"/>
  </svg>
)

const LoanIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* hand holding coins */}
    <ellipse cx="40" cy="62" rx="28" ry="10" fill="#8e6c40"/>
    <path d="M12 56 C12 56 20 50 40 50 C60 50 68 56 68 56" stroke="#8e6c40" strokeWidth="6" strokeLinecap="round" fill="none"/>
    {/* coins stack */}
    <ellipse cx="40" cy="38" rx="16" ry="6" fill="#f1c40f"/>
    <ellipse cx="40" cy="32" rx="16" ry="6" fill="#f39c12"/>
    <ellipse cx="40" cy="26" rx="16" ry="6" fill="#f1c40f"/>
    <ellipse cx="40" cy="20" rx="16" ry="6" fill="#f39c12"/>
    <text x="40" y="24" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7d6608" fontFamily="Poppins,sans-serif">SAR</text>
    {/* arrow badge */}
    <circle cx="64" cy="52" r="12" fill="#27ae60"/>
    <text x="64" y="57" textAnchor="middle" fontSize="14" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">↓</text>
  </svg>
)

const VATIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* percent symbol large */}
    <circle cx="28" cy="26" r="10" fill="white" opacity="0.9"/>
    <circle cx="52" cy="54" r="10" fill="white" opacity="0.9"/>
    <line x1="18" y1="62" x2="62" y2="18" stroke="white" strokeWidth="6" strokeLinecap="round" opacity="0.9"/>
    {/* ZATCA badge */}
    <circle cx="64" cy="18" r="12" fill="#27ae60"/>
    <text x="64" y="22" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">ZATCA</text>
  </svg>
)

const ChequeIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="6" y="22" width="58" height="34" rx="4" fill="white" opacity="0.95"/>
    <rect x="6" y="22" width="58" height="10" rx="4" fill="#2c3e50"/>
    <text x="35" y="31" textAnchor="middle" fontSize="7" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">PAY TO THE ORDER OF</text>
    <line x1="12" y1="40" x2="50" y2="40" stroke="#2c3e50" strokeWidth="1"/>
    <line x1="12" y1="46" x2="50" y2="46" stroke="#2c3e50" strokeWidth="1"/>
    <rect x="52" y="36" width="8" height="12" rx="1" fill="#f1c40f" opacity="0.7"/>
    {/* signature squiggle */}
    <path d="M12 52 Q20 48 28 52 Q36 56 44 52" stroke="#2980b9" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <circle cx="66" cy="20" r="12" fill="#e74c3c"/>
    <text x="66" y="24" textAnchor="middle" fontSize="10" fontWeight="900" fill="white" fontFamily="Poppins,sans-serif">✓</text>
  </svg>
)

const PettyCashIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* cash box */}
    <rect x="10" y="30" width="52" height="36" rx="4" fill="white" opacity="0.95"/>
    <rect x="10" y="30" width="52" height="10" rx="4" fill="#27ae60"/>
    {/* lock */}
    <rect x="34" y="40" width="12" height="10" rx="2" fill="#f39c12"/>
    <path d="M36 40 Q36 34 40 34 Q44 34 44 40" stroke="#e67e22" strokeWidth="2" fill="none"/>
    <circle cx="40" cy="45" r="2" fill="white"/>
    {/* coin slot */}
    <rect x="36" y="52" width="8" height="2" rx="1" fill="#85c1e9"/>
    {/* bills flying */}
    <rect x="62" y="14" width="14" height="8" rx="1" fill="#2ecc71" transform="rotate(-15 69 18)"/>
    <rect x="60" y="24" width="12" height="7" rx="1" fill="#27ae60" transform="rotate(10 66 27)"/>
    <circle cx="16" cy="20" r="8" fill="#f1c40f"/>
    <text x="16" y="24" textAnchor="middle" fontSize="8" fontWeight="900" fill="#7d6608" fontFamily="Poppins,sans-serif">$</text>
  </svg>
)

const RecurringIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* circular arrow */}
    <circle cx="40" cy="40" r="26" stroke="white" strokeWidth="5" strokeDasharray="30 15" opacity="0.9" fill="none"/>
    <polygon points="62,28 70,34 60,38" fill="white" opacity="0.9"/>
    {/* calendar */}
    <rect x="22" y="28" width="36" height="30" rx="3" fill="white" opacity="0.95"/>
    <rect x="22" y="28" width="36" height="9" rx="3" fill="#8C354B"/>
    <rect x="30" y="23" width="4" height="10" rx="2" fill="#c0392b"/>
    <rect x="46" y="23" width="4" height="10" rx="2" fill="#c0392b"/>
    <rect x="27" y="41" width="5" height="5" rx="1" fill="#c0392b"/>
    <rect x="35" y="41" width="5" height="5" rx="1" fill="#85c1e9"/>
    <rect x="43" y="41" width="5" height="5" rx="1" fill="#85c1e9"/>
    <rect x="27" y="49" width="5" height="5" rx="1" fill="#85c1e9"/>
    <rect x="35" y="49" width="5" height="5" rx="1" fill="#85c1e9"/>
  </svg>
)

const StaffActionIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* person */}
    <circle cx="30" cy="24" r="12" fill="#f4a460"/>
    <ellipse cx="30" cy="52" rx="16" ry="12" fill="#2980b9"/>
    {/* action badge: lightning */}
    <circle cx="58" cy="48" r="18" fill="#e67e22"/>
    <polygon points="62,34 54,48 60,48 56,62 68,46 60,46" fill="white"/>
  </svg>
)

const SiteIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* location pin */}
    <path d="M40 8 C28 8 18 18 18 30 C18 46 40 70 40 70 C40 70 62 46 62 30 C62 18 52 8 40 8 Z" fill="#e74c3c"/>
    <circle cx="40" cy="30" r="10" fill="white" opacity="0.9"/>
    {/* building in pin */}
    <rect x="34" y="25" width="12" height="10" rx="1" fill="#e74c3c" opacity="0.7"/>
    <rect x="36" y="27" width="3" height="4" rx="0.5" fill="white"/>
    <rect x="41" y="27" width="3" height="4" rx="0.5" fill="white"/>
    {/* grid/plan badge */}
    <circle cx="64" cy="20" r="12" fill="#2980b9"/>
    <rect x="58" y="14" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="64" y="14" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="58" y="20" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="64" y="20" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="58" y="26" width="4" height="4" rx="0.5" fill="white"/>
    <rect x="64" y="26" width="4" height="4" rx="0.5" fill="white"/>
  </svg>
)

const QRIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    <rect x="8" y="8" width="28" height="28" rx="3" fill="white" opacity="0.95"/>
    <rect x="12" y="12" width="20" height="20" rx="2" fill="#2d3436"/>
    <rect x="16" y="16" width="12" height="12" rx="1" fill="white"/>
    <rect x="44" y="8" width="28" height="28" rx="3" fill="white" opacity="0.95"/>
    <rect x="48" y="12" width="20" height="20" rx="2" fill="#2d3436"/>
    <rect x="52" y="16" width="12" height="12" rx="1" fill="white"/>
    <rect x="8" y="44" width="28" height="28" rx="3" fill="white" opacity="0.95"/>
    <rect x="12" y="48" width="20" height="20" rx="2" fill="#2d3436"/>
    <rect x="16" y="52" width="12" height="12" rx="1" fill="white"/>
    {/* scan line */}
    <line x1="44" y1="44" x2="72" y2="44" stroke="#f39c12" strokeWidth="3" strokeLinecap="round"/>
    <line x1="44" y1="50" x2="72" y2="50" strokeWidth="2" stroke="white" opacity="0.6" strokeLinecap="round"/>
    <line x1="44" y1="56" x2="60" y2="56" strokeWidth="2" stroke="white" opacity="0.6" strokeLinecap="round"/>
    <line x1="44" y1="62" x2="68" y2="62" strokeWidth="2" stroke="white" opacity="0.6" strokeLinecap="round"/>
    <line x1="44" y1="68" x2="56" y2="68" strokeWidth="2" stroke="white" opacity="0.6" strokeLinecap="round"/>
  </svg>
)

const ContractorIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* hard hat person */}
    <ellipse cx="40" cy="62" rx="20" ry="12" fill="#e67e22"/>
    <circle cx="40" cy="36" r="12" fill="#f4a460"/>
    {/* hard hat */}
    <ellipse cx="40" cy="28" rx="16" ry="8" fill="#f39c12"/>
    <rect x="22" y="28" width="36" height="5" rx="1" fill="#e67e22"/>
    <rect x="26" y="23" width="28" height="4" rx="8" fill="#f39c12"/>
    {/* wrench badge */}
    <circle cx="62" cy="56" r="14" fill="#7f8c8d"/>
    <rect x="56" y="50" width="5" height="12" rx="2" fill="white" transform="rotate(-45 58.5 56)"/>
    <circle cx="58" cy="52" r="4" stroke="white" strokeWidth="2" fill="none"/>
    <circle cx="66" cy="60" r="4" stroke="white" strokeWidth="2" fill="none"/>
  </svg>
)

const DepartmentIcon = () => (
  <svg width="70" height="70" viewBox="0 0 80 80" fill="none">
    {/* org chart */}
    <circle cx="40" cy="14" r="8" fill="white" opacity="0.9"/>
    <text x="40" y="18" textAnchor="middle" fontSize="8" fontWeight="900" fill="#454D9B" fontFamily="Poppins,sans-serif">HQ</text>
    <line x1="40" y1="22" x2="40" y2="34" stroke="white" strokeWidth="2" opacity="0.8"/>
    <line x1="18" y1="34" x2="62" y2="34" stroke="white" strokeWidth="2" opacity="0.8"/>
    <line x1="18" y1="34" x2="18" y2="44" stroke="white" strokeWidth="2" opacity="0.8"/>
    <line x1="40" y1="34" x2="40" y2="44" stroke="white" strokeWidth="2" opacity="0.8"/>
    <line x1="62" y1="34" x2="62" y2="44" stroke="white" strokeWidth="2" opacity="0.8"/>
    <circle cx="18" cy="52" r="8" fill="white" opacity="0.9"/>
    <circle cx="40" cy="52" r="8" fill="white" opacity="0.9"/>
    <circle cx="62" cy="52" r="8" fill="white" opacity="0.9"/>
    <text x="18" y="56" textAnchor="middle" fontSize="6" fontWeight="900" fill="#454D9B" fontFamily="Poppins,sans-serif">OPS</text>
    <text x="40" y="56" textAnchor="middle" fontSize="6" fontWeight="900" fill="#454D9B" fontFamily="Poppins,sans-serif">FIN</text>
    <text x="62" y="56" textAnchor="middle" fontSize="6" fontWeight="900" fill="#454D9B" fontFamily="Poppins,sans-serif">HR</text>
    {/* line to children */}
    <line x1="18" y1="60" x2="18" y2="68" stroke="white" strokeWidth="2" opacity="0.6"/>
    <line x1="40" y1="60" x2="40" y2="68" stroke="white" strokeWidth="2" opacity="0.6"/>
    <line x1="62" y1="60" x2="62" y2="68" stroke="white" strokeWidth="2" opacity="0.6"/>
  </svg>
)

/* ─── ICON REGISTRY ─────────────────────────────────────────────────────── */

const ICON_MAP = {
  // HR
  'HR Records':           EmployeeIcon,
  'Employee':             EmployeeIcon,
  'Outsource Employees':  ContractorIcon,
  'Staff Actions':        StaffActionIcon,
  // Operations / Masters
  'Fleet Management':     VehicleIcon,
  'Vehicle':              VehicleIcon,
  'LOI Request':          ContractIcon,
  'DH Approval':          ContractIcon,
  'DH Approval Required': ContractIcon,
  'Site Master':          SiteIcon,
  'QR Manager':           QRIcon,
  'Contractors':          ContractorIcon,
  'Departments':          DepartmentIcon,
  'Dept Details':         DepartmentIcon,
  // Finance
  'Invoices':             InvoiceIcon,
  'Invoice':              InvoiceIcon,
  'Payment':              MoneyRequestIcon,
  'Money Request':        MoneyRequestIcon,
  'Finance':              MoneyRequestIcon,
  'Expense Claims':       ExpenseIcon,
  'Expenses':             ExpenseIcon,
  'Expense':              ExpenseIcon,
  'Petty Cash':           PettyCashIcon,
  'Bank Accounts':        BankIcon,
  'Loan Accounts':        LoanIcon,
  'Loans & EOS':          LoanIcon,
  'VAT Payments':         VATIcon,
  'Cheque':               ChequeIcon,
  // Planning / Accounting
  'Fixed Assets':         FixedAssetIcon,
  'Asset Identity':       FixedAssetIcon,
  'Payroll':              PayrollIcon,
  'Procurement':          PurchaseOrderIcon,
  'Purchase Order':       PurchaseOrderIcon,
  'Insurance':            InsuranceIcon,
  'Iqama':                IqamaIcon,
  // Misc
  'Recurring Journals':   RecurringIcon,
  'Staff Action':         StaffActionIcon,
  'Project':              ProjectIcon,
  'Projects':             ProjectIcon,
  'Site':                 SiteIcon,
  'Commission Tracker':   PayrollIcon,
  'Agent Commissions':    PayrollIcon,
  'Cost Allocation':      PayrollIcon,
  'Recurring':            RecurringIcon,
}

/**
 * Returns the colorful SVG icon JSX for a given iconLabel string.
 * Falls back to null (PageBanner will use its defaultIcon SVG).
 */
export function getBannerIcon(iconLabel, color) {
  if (!iconLabel || typeof iconLabel !== 'string') return null
  // exact match first
  const Comp = ICON_MAP[iconLabel]
  if (Comp) return <Comp color={color} />
  // partial match
  const lower = iconLabel.toLowerCase()
  for (const [key, Comp2] of Object.entries(ICON_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return <Comp2 color={color} />
    }
  }
  return null
}

/* ─── STEP EMOJI AUTO-ASSIGN ────────────────────────────────────────────── */

const STEP_EMOJI_MAP = [
  [['identity', 'personal', 'info', 'party', 'detail', 'employee & date', 'employee & type', 'person'],  '👤'],
  [['employment', 'contract', 'work type', 'type'],                                                        '📋'],
  [['salary', 'payroll', 'pay period', 'financial', 'financials', 'billing', 'cost'],                      '💰'],
  [['bank', 'banking', 'account'],                                                                          '🏦'],
  [['attachment', 'document', 'upload', 'files'],                                                          '📎'],
  [['review', 'submit', 'confirm', 'done', 'preview'],                                                     '✅'],
  [['schedule', 'date', 'calendar', 'leave detail', 'departure'],                                          '📅'],
  [['vehicle', 'car', 'fleet'],                                                                             '🚗'],
  [['site', 'location', 'project & work'],                                                                  '📍'],
  [['team', 'member', 'crew'],                                                                              '👥'],
  [['note', 'comment', 'disposal', 'notes & disposal'],                                                    '📝'],
  [['line item', 'item', 'product', 'line'],                                                               '📦'],
  [['compliance', 'iqama', 'visa', 'id'],                                                                  '🪪'],
  [['asset', 'clearance'],                                                                                  '🏗'],
  [['insurance', 'health', 'vehicle insurance'],                                                           '🛡'],
  [['loan', 'eos', 'eosb', 'separation'],                                                                   '🤝'],
  [['vat', 'tax', 'gl', 'journal'],                                                                        '📊'],
  [['deduction', 'penalty', 'fine'],                                                                       '⚖️'],
  [['disburse', 'payment', 'transfer', 'send'],                                                            '💳'],
  [['assignment', 'assign', 'deployment'],                                                                  '📌'],
  [['message', 'notification', 'notice'],                                                                   '🔔'],
  [['home country', 'family', 'dependent'],                                                                 '🏠'],
  [['qr', 'scan', 'code'],                                                                                  '📲'],
  [['batch', 'bulk'],                                                                                       '📂'],
  [['entry', 'reference', 'approval'],                                                                     '✍️'],
  [['period', 'cycle', 'run'],                                                                              '🔄'],
]

/**
 * Returns an emoji string for a step name using keyword matching.
 * Falls back to '📋' if no match found.
 */
export function getStepEmoji(stepName) {
  if (!stepName) return '📋'
  const lower = stepName.toLowerCase()
  for (const [keywords, emoji] of STEP_EMOJI_MAP) {
    if (keywords.some(k => lower.includes(k))) return emoji
  }
  return '📋'
}
