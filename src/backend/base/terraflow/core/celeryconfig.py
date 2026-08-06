# celeryconfig.py
import os

terraflow_redis_host = os.environ.get("TERRAFLOW_REDIS_HOST")
terraflow_redis_port = os.environ.get("TERRAFLOW_REDIS_PORT")
# broker default user

if terraflow_redis_host and terraflow_redis_port:
    broker_url = f"redis://{terraflow_redis_host}:{terraflow_redis_port}/0"
    result_backend = f"redis://{terraflow_redis_host}:{terraflow_redis_port}/0"
else:
    # RabbitMQ
    mq_user = os.environ.get("RABBITMQ_DEFAULT_USER", "terraflow")
    mq_password = os.environ.get("RABBITMQ_DEFAULT_PASS", "terraflow")
    broker_url = os.environ.get("BROKER_URL", f"amqp://{mq_user}:{mq_password}@localhost:5672//")
    result_backend = os.environ.get("RESULT_BACKEND", "redis://localhost:6379/0")
# tasks should be json or pickle
accept_content = ["json", "pickle"]
