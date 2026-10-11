"""Request validation. Field names are camelCase to match the JSON the frontend sends."""

from datetime import UTC, datetime, timedelta

from django.conf import settings
from rest_framework import serializers

from core.domain.checkpoints import ALLOWED_INTERVALS_MI
from core.domain.geo import haversine_m
from core.domain.grid import BBox

MIN_WEIGHT_LB = 1_000
MAX_WEIGHT_LB = 80_000
DEPARTURE_SLACK = timedelta(minutes=10)
MIN_TRIP_METERS = 500
MAX_BBOX_SPAN_DEG = (60.0, 30.0)  # lon, lat


class PlaceSerializer(serializers.Serializer):
    lon = serializers.FloatField(min_value=-180, max_value=180)
    lat = serializers.FloatField(min_value=-85, max_value=85)
    label = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class PlanRequestSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField(default_timezone=UTC)
    weightLb = serializers.IntegerField(
        min_value=MIN_WEIGHT_LB,
        max_value=MAX_WEIGHT_LB,
        error_messages={
            "min_value": "Load weight must be between 1,000 and 80,000 lb.",
            "max_value": "Load weight must be between 1,000 and 80,000 lb.",
        },
    )
    intervalMi = serializers.ChoiceField(
        choices=ALLOWED_INTERVALS_MI,
        default=25,
        error_messages={"invalid_choice": "Checkpoint interval must be 10, 25 or 50 miles."},
    )

    def validate_departure(self, value: datetime) -> datetime:
        now = self.context.get("now") or datetime.now(UTC)
        value = value.astimezone(UTC)
        if value < now - DEPARTURE_SLACK:
            raise serializers.ValidationError("Departure time is in the past.")
        if value > now + timedelta(hours=settings.FORECAST_HORIZON_HOURS):
            days = settings.FORECAST_HORIZON_HOURS // 24
            raise serializers.ValidationError(
                f"Departure must be within the {days}-day forecast window."
            )
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if haversine_m((o["lon"], o["lat"]), (d["lon"], d["lat"])) < MIN_TRIP_METERS:
            raise serializers.ValidationError(
                {"destination": "Origin and destination must be different places."}
            )
        return attrs


class GeocodeQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
    proximity = serializers.CharField(required=False, allow_blank=True)

    def validate_proximity(self, value: str):
        if not value:
            return None
        try:
            lon, lat = (float(v) for v in value.split(","))
        except ValueError as exc:
            raise serializers.ValidationError("Use 'lon,lat'.") from exc
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise serializers.ValidationError("Coordinates out of range.")
        return (lon, lat)


class HeatmapQuerySerializer(serializers.Serializer):
    bbox = serializers.CharField()

    def validate_bbox(self, value: str) -> BBox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in value.split(","))
        except ValueError as exc:
            raise serializers.ValidationError("Use 'minLon,minLat,maxLon,maxLat'.") from exc
        if not (-180 <= min_lon < max_lon <= 180 and -85 <= min_lat < max_lat <= 85):
            raise serializers.ValidationError("Bounding box is out of range or inverted.")
        if max_lon - min_lon > MAX_BBOX_SPAN_DEG[0] or max_lat - min_lat > MAX_BBOX_SPAN_DEG[1]:
            raise serializers.ValidationError("Bounding box is too large.")
        return BBox(min_lon, min_lat, max_lon, max_lat)
