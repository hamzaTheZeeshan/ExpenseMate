from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("type", "amount", "merchant", "user", "occurred_at")
    list_filter = ("type",)
    search_fields = ("merchant", "note")