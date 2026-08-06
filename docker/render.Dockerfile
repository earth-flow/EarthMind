FROM terraflowai/terraflow:latest

ENTRYPOINT ["python", "-m", "terraflow", "run"]
