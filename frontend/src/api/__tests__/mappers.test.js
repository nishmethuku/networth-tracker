/**
 * Minimal frontend tests - Mapper output validation
 * Goal: Prove data mapping correctness and prevent regressions
 */

import { mapAsset, mapSummary, mapAnalytics } from "../mappers";

describe("Data Mappers", () => {
  describe("mapAsset", () => {
    it("should map backend asset to frontend format correctly", () => {
      const backendAsset = {
        id: 1,
        asset_type: "stock",
        country: "US",
        account: "Brokerage",
        purchase_date: "2023-01-01",
        created_at: "2023-01-01T00:00:00",
        symbol: "AAPL",
        units: 10.0,
        buy_price: 100.0,
        buy_value: 1000.0,
        current_value: 1100.0,
        profit: 100.0,
        profit_pct: 10.0,
        cagr: 0.1,
      };

      const mapped = mapAsset(backendAsset);

      expect(mapped.id).toBe(1);
      expect(mapped.assetType).toBe("stock");
      expect(mapped.country).toBe("US");
      expect(mapped.account).toBe("Brokerage");
      expect(mapped.symbol).toBe("AAPL");
      expect(mapped.units).toBe(10.0);
      expect(mapped.buyPrice).toBe(100.0);
      expect(mapped.buyValue).toBe(1000.0);
      expect(mapped.currentValue).toBe(1100.0);
      expect(mapped.profit).toBe(100.0);
      expect(mapped.profitPercent).toBe(10.0);
      expect(mapped.cagr).toBe(0.1);
      expect(mapped.displayName).toBe("AAPL");
    });

    it("should handle null/undefined values gracefully", () => {
      const backendAsset = {
        id: 2,
        asset_type: "cash",
        country: "US",
        account: "Savings",
        purchase_date: "2023-01-01",
        created_at: null,
        symbol: null,
        units: null,
        buy_price: null,
        buy_value: null,
        current_value: null,
        profit: null,
        profit_pct: null,
        cagr: null,
      };

      const mapped = mapAsset(backendAsset);

      expect(mapped.id).toBe(2);
      expect(mapped.symbol).toBeNull();
      expect(mapped.units).toBe(0);
      expect(mapped.buyPrice).toBe(0);
      expect(mapped.buyValue).toBe(0);
      expect(mapped.currentValue).toBe(0);
      expect(mapped.profit).toBe(0);
      expect(mapped.profitPercent).toBe(0);
      expect(mapped.cagr).toBe(0);
    });

    it("should handle missing fields without crashing", () => {
      const backendAsset = {
        id: 3,
        asset_type: "real_estate",
      };

      const mapped = mapAsset(backendAsset);

      expect(mapped.id).toBe(3);
      expect(mapped.assetType).toBe("real_estate");
      expect(mapped.country).toBe("");
      expect(mapped.account).toBe("");
      expect(mapped.buyValue).toBe(0);
      expect(mapped.currentValue).toBe(0);
    });

    it("should generate displayName correctly", () => {
      const assetWithSymbol = mapAsset({
        id: 1,
        asset_type: "stock",
        symbol: "AAPL",
        country: "US",
        account: "Test",
        purchase_date: "2023-01-01",
      });
      expect(assetWithSymbol.displayName).toBe("AAPL");

      const assetWithName = mapAsset({
        id: 2,
        asset_type: "real_estate",
        name: "My House",
        country: "US",
        account: "Test",
        purchase_date: "2023-01-01",
      });
      expect(assetWithName.displayName).toBe("My House");

      const assetWithInstitution = mapAsset({
        id: 3,
        asset_type: "cash",
        institution: "Chase Bank",
        country: "US",
        account: "Test",
        purchase_date: "2023-01-01",
      });
      expect(assetWithInstitution.displayName).toBe("Chase Bank");

      const assetWithNothing = mapAsset({
        id: 4,
        asset_type: "cash",
        country: "US",
        account: "Test",
        purchase_date: "2023-01-01",
      });
      expect(assetWithNothing.displayName).toBe("Asset #4");
    });
  });

  describe("mapSummary", () => {
    it("should map summary data correctly", () => {
      const backendSummary = {
        total_net_worth: 100000.0,
        total_stock_value: 50000.0,
        total_property_value: 30000.0,
        total_profit_loss: 10000.0,
        grand_totals: {
          buy_value: 90000.0,
          current_value: 100000.0,
          profit: 10000.0,
          profit_pct: 11.11,
          cagr: 0.1,
        },
        countries: [],
      };

      const mapped = mapSummary(backendSummary);

      expect(mapped.totalNetWorth).toBe(100000.0);
      expect(mapped.totalStockValue).toBe(50000.0);
      expect(mapped.totalPropertyValue).toBe(30000.0);
      expect(mapped.totalProfitLoss).toBe(10000.0);
      expect(mapped.grandTotals.buyValue).toBe(90000.0);
      expect(mapped.grandTotals.currentValue).toBe(100000.0);
      expect(mapped.grandTotals.profit).toBe(10000.0);
      expect(mapped.grandTotals.profitPercent).toBe(11.11);
      expect(mapped.grandTotals.cagr).toBe(0.1);
    });

    it("should handle null/undefined summary", () => {
      const mapped = mapSummary(null);
      expect(mapped).toBeNull();
    });

    it("should handle missing totals", () => {
      const backendSummary = {
        total_net_worth: 0,
        total_stock_value: 0,
        total_property_value: 0,
        total_profit_loss: 0,
        grand_totals: null,
        countries: [],
      };

      const mapped = mapSummary(backendSummary);
      expect(mapped.grandTotals.buyValue).toBe(0);
      expect(mapped.grandTotals.currentValue).toBe(0);
      expect(mapped.grandTotals.profit).toBe(0);
    });
  });

  describe("mapAnalytics", () => {
    it("should map analytics data correctly", () => {
      const backendAnalytics = {
        net_worth_over_time: [
          { date: "2023-01-01", net_worth: 10000, assets_value: 9000 },
          { date: "2023-02-01", net_worth: 11000, assets_value: 9000 },
        ],
        allocation: [
          { label: "stock", value: 5000 },
          { label: "cash", value: 3000 },
        ],
        cagr_histogram: [
          { label: "AAPL", asset_type: "stock", country: "US", account: "Test", cagr: 0.1 },
        ],
      };

      const mapped = mapAnalytics(backendAnalytics);

      expect(mapped.netWorthOverTime).toHaveLength(2);
      expect(mapped.netWorthOverTime[0].netWorth).toBe(10000);
      expect(mapped.netWorthOverTime[0].assetsValue).toBe(9000);

      expect(mapped.allocation).toHaveLength(2);
      expect(mapped.allocation[0].label).toBe("stock");
      expect(mapped.allocation[0].value).toBe(5000);

      expect(mapped.cagrHistogram).toHaveLength(1);
      expect(mapped.cagrHistogram[0].label).toBe("AAPL");
      expect(mapped.cagrHistogram[0].cagr).toBe(0.1);
      expect(mapped.cagrHistogram[0].cagrPercent).toBe(10.0); // 0.1 * 100
    });

    it("should handle null/undefined analytics", () => {
      const mapped = mapAnalytics(null);
      expect(mapped).toBeNull();
    });

    it("should handle empty arrays", () => {
      const backendAnalytics = {
        net_worth_over_time: [],
        allocation: [],
        cagr_histogram: [],
      };

      const mapped = mapAnalytics(backendAnalytics);
      expect(mapped.netWorthOverTime).toEqual([]);
      expect(mapped.allocation).toEqual([]);
      expect(mapped.cagrHistogram).toEqual([]);
    });
  });
});
