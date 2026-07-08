# celeryconfig.py
import os

earthmind_redis_host = os.environ.get("EARTHMIND_REDIS_HOST")
earthmind_redis_port = os.environ.get("EARTHMIND_REDIS_PORT")
# broker default user

if earthmind_redis_host and earthmind_redis_port:
    broker_url = f"redis://{earthmind_redis_host}:{earthmind_redis_port}/0"
    result_backend = f"redis://{earthmind_redis_host}:{earthmind_redis_port}/0"
else:
    # RabbitMQ
    mq_user = os.environ.get("RABBITMQ_DEFAULT_USER", "earthmind")
    mq_password = os.environ.get("RABBITMQ_DEFAULT_PASS", "earthmind")
    broker_url = os.environ.get("BROKER_URL", f"amqp://{mq_user}:{mq_password}@localhost:5672//")
    result_backend = os.environ.get("RESULT_BACKEND", "redis://localhost:6379/0")
# tasks should be json or pickle
accept_content = ["json", "pickle"]
