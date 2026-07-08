from fastapi_pagination import Page

from earthmind.helpers.base_model import BaseModel
from earthmind.services.database.models.flow.model import FlowRead
from earthmind.services.database.models.folder.model import FolderRead


class FolderWithPaginatedFlows(BaseModel):
    folder: FolderRead
    flows: Page[FlowRead]
