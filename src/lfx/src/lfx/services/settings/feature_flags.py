from pydantic_settings import BaseSettings


class FeatureFlags(BaseSettings):
    wxo_deployments: bool = False
    """
    Enable Watsonx Orchestrate deployments.
    """
    mvp_components: bool = False

    class Config:
        env_prefix = "EARTHMIND_FEATURE_"


FEATURE_FLAGS = FeatureFlags()
