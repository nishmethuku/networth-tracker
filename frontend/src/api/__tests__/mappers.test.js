/**
 * Minimal frontend tests - Mapper output validation
 * Goal: Prove data mapping correctness and prevent regressions
 */

import { mapHolding, mapTransaction, mapValuation, mapDashboard } from "../mappers";

describe("Data Mappers", () => {
  describe("mapHolding", () => {
    it("maps a quantity-based holding (stock) with computed metrics", () => {
      const backend = {
        id: 1,
        user_id: "u1",
        household_id: null,
        asset_type: "stock",
        symbol: "AAPL",
        name: "AAPL",
        country: "United States",
        account: "Brokerage",
        currency: "USD",
        is_private: false,
        tags: "tech, long-term",
        quantity: 10,
        avg_cost: 100,
        cost_basis: 1000,
        current_price: 120,
        current_value: 1200,
        display_value: 1200,
        realized_gain: 0,
        unrealized_gain: 200,
        total_gain: 200,
        xirr: 0.15,
      };

      const mapped = mapHolding(backend);

      expect(mapped.id).toBe(1);
      expect(mapped.assetType).toBe("stock");
      expect(mapped.quantity).toBe(10);
      expect(mapped.avgCost).toBe(100);
      expect(mapped.currentValue).toBe(1200);
      expect(mapped.displayValue).toBe(1200);
      expect(mapped.unrealizedGain).toBe(200);
      expect(mapped.xirr).toBe(0.15);
      expect(mapped.tags).toEqual(["tech", "long-term"]);
      expect(mapped.displayName).toBe("AAPL");
    });

    it("maps a valuation-based holding (real estate) without quantity fields", () => {
      const backend = {
        id: 2,
        user_id: "u1",
        household_id: null,
        asset_type: "real_estate",
        symbol: null,
        name: "My House",
        country: "United States",
        account: "Property",
        currency: "USD",
        is_private: false,
        current_value: 220000,
        display_value: 220000,
        first_value: 200000,
        gain: 20000,
      };

      const mapped = mapHolding(backend);

      expect(mapped.quantity).toBeNull();
      expect(mapped.avgCost).toBeNull();
      expect(mapped.currentValue).toBe(220000);
      expect(mapped.gain).toBe(20000);
      expect(mapped.displayName).toBe("My House");
    });

    it("handles null input gracefully", () => {
      expect(mapHolding(null)).toBeNull();
    });
  });

  describe("mapTransaction", () => {
    it("maps a transaction correctly", () => {
      const mapped = mapTransaction({
        id: 5,
        holding_id: 1,
        holding_name: "AAPL",
        holding_symbol: "AAPL",
        asset_type: "stock",
        transaction_type: "buy",
        transaction_date: "2024-01-01",
        quantity: 10,
        price_per_unit: 100,
        currency: "USD",
        fees: 5,
      });

      expect(mapped.transactionType).toBe("buy");
      expect(mapped.quantity).toBe(10);
      expect(mapped.pricePerUnit).toBe(100);
      expect(mapped.fees).toBe(5);
    });
  });

  describe("mapValuation", () => {
    it("maps a valuation entry correctly", () => {
      const mapped = mapValuation({
        id: 9,
        holding_id: 2,
        valuation_date: "2024-06-01",
        value: 220000,
        currency: "USD",
      });

      expect(mapped.value).toBe(220000);
      expect(mapped.valuationDate).toBe("2024-06-01");
    });
  });

  describe("mapDashboard", () => {
    it("maps dashboard aggregates correctly", () => {
      const mapped = mapDashboard({
        total_net_worth: 500000,
        currency: "USD",
        allocation_by_type: [{ label: "stock", value: 300000 }],
        allocation_by_country: [{ label: "United States", value: 500000 }],
        top_gainers: [{ id: 1, name: "AAPL", symbol: "AAPL", asset_type: "stock", change_pct: 12.5, current_value: 1200 }],
        top_losers: [],
        realized_gain: 1000,
        unrealized_gain: 2000,
      });

      expect(mapped.totalNetWorth).toBe(500000);
      expect(mapped.allocationByType).toHaveLength(1);
      expect(mapped.topGainers[0].changePct).toBe(12.5);
      expect(mapped.realizedGain).toBe(1000);
    });

    it("handles null input gracefully", () => {
      expect(mapDashboard(null)).toBeNull();
    });
  });
});
