"""
API Contract Tests (Day 5A)

Purpose: Verify that critical API endpoints maintain their contracts.
These tests prevent silent breaking changes to the API schema.

Run: pytest tests/test_api_contract.py -v
"""
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError
from typing import List, Optional
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from app.main import app

client = TestClient(app)


# =============================================================================
# Contract Models - Define expected response schemas
# =============================================================================

class HealthResponse(BaseModel):
    """Contract for GET /health"""
    status: str
    time: str


class ApiHealthResponse(BaseModel):
    """Contract for GET /api/health"""
    status: str
    timestamp: str


class ChartOHLCVRow(BaseModel):
    """Contract for OHLCV row in /chart/ohlcv response"""
    t: str  # ISO timestamp
    o: float  # Open
    h: float  # High
    l: float  # Low
    c: float  # Close
    v: float  # Volume


class ChartOHLCVMeta(BaseModel):
    """Contract for meta object in /chart/ohlcv response"""
    symbol: str
    bar: str
    tz: str
    source: str
    fallback: bool


class ChartOHLCVResponse(BaseModel):
    """Contract for GET /chart/ohlcv"""
    symbol: str
    bar: str
    tz: str
    source: str
    fallback: bool
    rows: List[ChartOHLCVRow]
    meta: ChartOHLCVMeta
    error: Optional[str] = None


class MetaStrategiesResponse(BaseModel):
    """Contract for GET /meta/strategies"""
    items: List[str]


class MetaSymbolItem(BaseModel):
    """Contract for symbol item in /meta/symbols"""
    code: str
    name: str


class MetaSymbolsResponse(BaseModel):
    """Contract for GET /meta/symbols"""
    items: List[MetaSymbolItem]


# =============================================================================
# Contract Tests
# =============================================================================

class TestHealthEndpoints:
    """Tests for health check endpoints"""
    
    def test_health_returns_200(self):
        """GET /health should return 200"""
        response = client.get("/health")
        assert response.status_code == 200
    
    def test_health_schema(self):
        """GET /health should match HealthResponse schema"""
        response = client.get("/health")
        data = response.json()
        
        # Validate against contract
        health = HealthResponse(**data)
        assert health.status == "ok"
        assert health.time  # Non-empty ISO timestamp
    
    def test_api_health_returns_200(self):
        """GET /api/health should return 200"""
        response = client.get("/api/health")
        assert response.status_code == 200
    
    def test_api_health_schema(self):
        """GET /api/health should match ApiHealthResponse schema"""
        response = client.get("/api/health")
        data = response.json()
        
        # Validate against contract
        health = ApiHealthResponse(**data)
        assert health.status == "ok"
        assert health.timestamp  # Non-empty ISO timestamp


class TestMetaEndpoints:
    """Tests for metadata endpoints"""
    
    def test_meta_strategies_returns_200(self):
        """GET /meta/strategies should return 200"""
        response = client.get("/meta/strategies")
        assert response.status_code == 200
    
    def test_meta_strategies_schema(self):
        """GET /meta/strategies should return list of strategy IDs"""
        response = client.get("/meta/strategies")
        data = response.json()
        
        # Validate against contract
        meta = MetaStrategiesResponse(**data)
        assert isinstance(meta.items, list)
        # All items should be strings
        for item in meta.items:
            assert isinstance(item, str)
    
    def test_meta_symbols_returns_200(self):
        """GET /meta/symbols should return 200"""
        response = client.get("/meta/symbols")
        assert response.status_code == 200
    
    def test_meta_symbols_schema(self):
        """GET /meta/symbols should return list of symbol objects"""
        response = client.get("/meta/symbols")
        data = response.json()
        
        # Should have items key
        assert "items" in data
        assert isinstance(data["items"], list)
        
        # If items exist, validate schema
        for item in data["items"]:
            assert "code" in item
            assert "name" in item


class TestChartEndpoints:
    """Tests for chart data endpoints"""
    
    def test_chart_ohlcv_requires_symbol(self):
        """GET /chart/ohlcv without symbol should return 422"""
        response = client.get("/chart/ohlcv")
        assert response.status_code == 422
    
    def test_chart_ohlcv_with_symbol_returns_valid_response(self):
        """GET /chart/ohlcv with symbol should return valid schema (may be 404 if no data)"""
        # Try with a common test symbol
        response = client.get("/chart/ohlcv", params={
            "symbol": "ABB.ST",
            "bar": "D",
            "limit": 10
        })
        
        # Either 200 with data or 404 if no cache/API key
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            # Validate against contract
            ohlcv = ChartOHLCVResponse(**data)
            assert ohlcv.symbol == "ABB.ST"
            assert ohlcv.bar == "D"
            assert isinstance(ohlcv.rows, list)
            
            # If rows exist, validate row schema
            if ohlcv.rows:
                row = ohlcv.rows[0]
                assert row.t  # Has timestamp
                assert row.o > 0  # Open price
                assert row.h >= row.l  # High >= Low
    
    def test_chart_ohlcv_schema_keys(self):
        """GET /chart/ohlcv response should have required keys"""
        response = client.get("/chart/ohlcv", params={
            "symbol": "TEST.FAKE",
            "bar": "D",
            "limit": 5
        })
        
        # 404 is expected for fake symbol, but should still be valid JSON
        if response.status_code == 200:
            data = response.json()
            required_keys = ["symbol", "bar", "tz", "source", "fallback", "rows", "meta"]
            for key in required_keys:
                assert key in data, f"Missing required key: {key}"


class TestAlertEndpoints:
    """Tests for alert API endpoints
    
    BUG-001 FIXED: Alert model converted from Pydantic BaseModel to SQLModel table.
    Day 8: Added POST /alerts test.
    """
    
    def test_alerts_list_returns_200(self):
        """GET /alerts should return 200"""
        response = client.get("/alerts")
        assert response.status_code == 200
    
    def test_alerts_list_schema(self):
        """GET /alerts should return list structure"""
        response = client.get("/alerts")
        data = response.json()
        
        # Should have items key with list
        assert "items" in data
        assert isinstance(data["items"], list)
    
    def test_alerts_create_price_alert(self):
        """POST /alerts should create a price alert and return 200"""
        payload = {
            "symbol": "TEST.US",
            "bar": "D",
            "type": "price",
            "direction": "cross_up",
            "geometry": {"price": 100.0},
            "label": "Test Price Alert",
            "enabled": True,
            "one_shot": False,
            "cooldown_min": 0,
            "tol_bps": 0
        }
        response = client.post("/alerts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") is True
        assert "alert" in data
        assert data["alert"]["symbol"] == "TEST.US"
        assert data["alert"]["type"] == "price"
    
    def test_alerts_create_trendline_alert(self):
        """POST /alerts should create a trendline alert and return 200"""
        payload = {
            "symbol": "TREND.US",
            "bar": "D",
            "type": "trendline",
            "direction": "cross_any",
            "geometry": {
                "start": {"time": 1700000000, "price": 100.0},
                "end": {"time": 1700100000, "price": 110.0}
            },
            "label": "Test Trendline Alert",
            "enabled": True,
            "one_shot": True,
            "cooldown_min": 5,
            "tol_bps": 10
        }
        response = client.post("/alerts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") is True
        assert "alert" in data
        assert data["alert"]["type"] == "trendline"
        assert data["alert"]["one_shot"] is True


class TestContractStability:
    """Meta-tests to ensure contracts don't silently break"""
    
    def test_health_response_is_not_empty_object(self):
        """Health endpoints should not return empty objects"""
        response = client.get("/health")
        data = response.json()
        assert len(data) > 0, "Health response should not be empty"
        
        response = client.get("/api/health")
        data = response.json()
        assert len(data) > 0, "API health response should not be empty"
    
    def test_meta_endpoints_return_objects_not_arrays(self):
        """Meta endpoints should return objects with 'items' key, not raw arrays"""
        response = client.get("/meta/strategies")
        data = response.json()
        assert isinstance(data, dict), "/meta/strategies should return object"
        assert "items" in data, "/meta/strategies should have 'items' key"
        
        response = client.get("/meta/symbols")
        data = response.json()
        assert isinstance(data, dict), "/meta/symbols should return object"
        assert "items" in data, "/meta/symbols should have 'items' key"


# =============================================================================
# Run markers for CI
# =============================================================================

# Mark all tests in this module as contract tests
pytestmark = pytest.mark.contract
