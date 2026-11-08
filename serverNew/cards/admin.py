from django.contrib import admin

from .models import Card


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("nickname", "user", "last_four", "is_default", "created_at")
    list_filter = ("is_default",)
    search_fields = ("nickname", "last_four")