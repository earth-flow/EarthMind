FROM terraflowai/terraflow:1.0-alpha

CMD ["python", "-m", "terraflow", "run", "--host", "0.0.0.0", "--port", "7860"]
