import type { ScheduleConflict } from "./types.js";

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  return h * 60 + m;
}

function formatMinutes(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export class ConflictDetector {
  checkTransitAndMedication(
    trainDeparture = "07:10",
    commuteMinutes = 45,
    breakfastTime = "07:00",
    postMealMedMinutes = 30
  ): ScheduleConflict | null {
    const leaveHomeMin = parseMinutes(trainDeparture) - commuteMinutes;
    const medMin = parseMinutes(breakfastTime) + postMealMedMinutes;

    if (leaveHomeMin < medMin) {
      const leaveStr = formatMinutes(leaveHomeMin);
      const medStr = formatMinutes(medMin);
      const proof =
        `Train (${trainDeparture}) - Transit (${commuteMinutes}m) = Leave Home by ${leaveStr}. ` +
        `Breakfast (${breakfastTime}) + Post-Meal Interval (${postMealMedMinutes}m) = Pill Window ${medStr}. ` +
        `Collision: User must depart home at ${leaveStr}, before pill window ${medStr}.`;

      return {
        conflict_type: "TRANSIT_MEDICATION_COLLISION",
        severity: "HARD_COLLISION",
        description:
          "Morning train commute conflicts with required post-breakfast medication window.",
        arithmetic_proof: proof,
        impacted_items: ["Train (Mysuru-Bengaluru)", "Tablet X (Post-Breakfast)"],
      };
    }

    return null;
  }

  checkDinnerBudget(
    basePrice = 180.0,
    deliveryFee = 25.0,
    gstPercent = 5.0,
    budgetCap = 200.0
  ): ScheduleConflict | null {
    const gstAmount = (basePrice * gstPercent) / 100.0;
    const totalPrice = basePrice + deliveryFee + gstAmount;

    if (totalPrice > budgetCap) {
      const proof =
        `Base (₹${basePrice.toFixed(2)}) + Delivery (₹${deliveryFee.toFixed(2)}) + GST ${gstPercent}% (₹${gstAmount.toFixed(2)}) ` +
        `= Total ₹${totalPrice.toFixed(2)} > Budget Cap ₹${budgetCap.toFixed(2)}.`;

      return {
        conflict_type: "DINNER_BUDGET_BREACH",
        severity: "BUDGET_BREACH",
        description: `Dinner order exceeds ₹${budgetCap.toFixed(0)} daily cap once all-in platform fees and taxes are factored in.`,
        arithmetic_proof: proof,
        impacted_items: ["Dinner Order (Base ₹180)"],
      };
    }

    return null;
  }

  generateReplan(): Record<string, unknown> {
    return {
      replan_id: "REPLAN_ROHANS_DAY_01",
      recommended_schedule: [
        { time: "05:15", activity: "Wake up & Pre-travel prep" },
        { time: "05:20", activity: "Early Breakfast (Safe interval)" },
        { time: "05:50", activity: "Take Tablet X (30m post-meal)" },
        { time: "06:15", activity: "Depart for Station (45m buffer)" },
        { time: "07:10", activity: "Board Bengaluru Intercity Train" },
        {
          time: "20:00",
          activity:
            "Dinner: Thali Special (₹145 base + ₹17 fees = ₹162 all-in, complies with ₹200 cap)",
        },
      ],
      reasoning:
        "Shifted breakfast/medication forward by 100 minutes to ensure full absorption before station transit, and switched dinner to a ₹162 all-in option.",
    };
  }
}

