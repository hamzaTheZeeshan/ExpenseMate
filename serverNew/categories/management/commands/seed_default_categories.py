from django.core.management.base import BaseCommand

from categories.models import Category

DEFAULT_CATEGORIES = [
    {"name": "Food", "icon": "utensils", "color": "#F97316"},
    {"name": "Bills", "icon": "receipt", "color": "#EF4444"},
    {"name": "Sporting goods", "icon": "dumbbell", "color": "#22C55E"},
    {"name": "Home goods", "icon": "home", "color": "#3B82F6"},
    {"name": "Clothing", "icon": "shirt", "color": "#A855F7"},
    {"name": "Other", "icon": "tag", "color": "#6B7280"},
]


class Command(BaseCommand):
    help = "Seed global default categories (idempotent). Replaces prisma/seed.js."

    def handle(self, *args, **options):
        for category in DEFAULT_CATEGORIES:
            exists = Category.objects.filter(
                name=category["name"], user__isnull=True, is_default=True
            ).exists()

            if exists:
                self.stdout.write(f'Skipping "{category["name"]}" — already seeded.')
                continue

            Category.objects.create(**category, user=None, is_default=True)
            self.stdout.write(f'Seeded default category "{category["name"]}".')