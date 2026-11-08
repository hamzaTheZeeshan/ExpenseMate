import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Category",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        db_column="id",
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.TextField(db_column="name")),
                ("icon", models.TextField(blank=True, db_column="icon", null=True)),
                ("color", models.TextField(blank=True, db_column="color", null=True)),
                (
                    "is_default",
                    models.BooleanField(db_column="is_default", default=False, null=True),
                ),
                (
                    "created_at",
                    models.DateTimeField(
                        db_column="created_at",
                        default=django.utils.timezone.now,
                        null=True,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        db_column="user_id",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="categories",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "categories",
                "managed": False,
            },
        ),
        migrations.AddConstraint(
            model_name="category",
            constraint=models.UniqueConstraint(
                fields=("user", "name"), name="categories_user_id_name_key"
            ),
        ),
    ]