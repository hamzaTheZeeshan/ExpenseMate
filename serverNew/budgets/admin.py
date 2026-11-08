from django.contrib import admin

from .models import Budget


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("period", "amount", "user", "category", "start_date", "end_date")
    list_filter = ("period",)