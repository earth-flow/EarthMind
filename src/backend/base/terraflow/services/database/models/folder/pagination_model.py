from fastapi_pagination import Page

from terraflow.helpers.base_model import BaseModel
from terraflow.services.database.models.flow.model import FlowRead
from terraflow.services.database.models.folder.model import FolderRead


class FolderWithPaginatedFlows(BaseModel):
    folder: FolderRead
    flows: Page[FlowRead]
