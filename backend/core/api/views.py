from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from core.services import geocoding, heatmap, planner

from .presenters import present_plan
from .serializers import (
    GeocodeQuerySerializer,
    HeatmapQuerySerializer,
    PlanRequestSerializer,
    RestPlanSerializer,
)


class HealthView(APIView):
    throttle_classes = []

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "mapboxConfigured": bool(settings.MAPBOX_ACCESS_TOKEN),
                "windMetric": settings.WIND_METRIC,
            }
        )


class GeocodeView(APIView):
    throttle_scope = "geocode"

    def get(self, request):
        query = GeocodeQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        results = geocoding.search(data["q"], data.get("proximity"), data.get("country"))
        response = Response({"results": results})
        response["Cache-Control"] = "public, max-age=3600"
        return response


class PlanView(APIView):
    throttle_scope = "plan"

    def post(self, request):
        serializer = PlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        req = planner.PlanRequest(
            origin=planner.Place(**data["origin"]),
            destination=planner.Place(**data["destination"]),
            departure=data["departure"],
            weight_lb=data["weightLb"],
            interval_mi=int(data["intervalMi"]),
            distance_unit=data["distanceUnit"],
            rest_plan=(
                RestPlanSerializer().to_rest_plan(data["restPlan"])
                if data.get("restPlan")
                else None
            ),
        )
        return Response(present_plan(planner.plan_trip(req)))


class HeatmapView(APIView):
    throttle_scope = "heatmap"

    def get(self, request):
        query = HeatmapQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        response = Response(heatmap.build_heatmap(query.validated_data["bbox"]))
        response["Cache-Control"] = "public, max-age=600"
        return response
