FROM earthmindai/earthmind:1.0-alpha

CMD ["python", "-m", "earthmind", "run", "--host", "0.0.0.0", "--port", "7860"]
