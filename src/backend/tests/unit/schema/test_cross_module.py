"""Unit tests for cross-module isinstance functionality.

These tests verify that isinstance checks work correctly when classes are
re-exported from different modules (e.g., lfx.schema.Message vs earthmind.schema.Message).
"""

from earthmind.schema import Data as EarthMindData
from earthmind.schema import Message as EarthMindMessage
from lfx.schema.data import Data as LfxData
from lfx.schema.message import Message as LfxMessage


class TestDuckTypingData:
    """Tests for duck-typing Data class across module boundaries."""

    def test_lfx_data_isinstance_earthmind_data(self):
        """Test that lfx.Data instance is recognized as earthmind.Data."""
        lfx_data = LfxData(data={"key": "value"})
        assert isinstance(lfx_data, EarthMindData)

    def test_earthmind_data_isinstance_lfx_data(self):
        """Test that earthmind.Data instance is recognized as lfx.Data."""
        earthmind_data = EarthMindData(data={"key": "value"})
        assert isinstance(earthmind_data, LfxData)

    def test_data_equality_across_modules(self):
        """Test that Data objects from different modules are equal."""
        lfx_data = LfxData(data={"key": "value"})
        earthmind_data = EarthMindData(data={"key": "value"})
        assert lfx_data == earthmind_data

    def test_data_interchangeable_in_functions(self):
        """Test that Data from different modules work interchangeably."""

        def process_data(data: EarthMindData) -> str:
            return data.get_text()

        lfx_data = LfxData(data={"text": "hello"})
        # Should not raise type error
        result = process_data(lfx_data)
        assert result == "hello"

    def test_data_model_dump_compatible(self):
        """Test that model_dump works across module boundaries."""
        lfx_data = LfxData(data={"key": "value"})
        earthmind_data = EarthMindData(**lfx_data.model_dump())
        assert earthmind_data.data == {"key": "value"}


class TestDuckTypingMessage:
    """Tests for duck-typing Message class across module boundaries."""

    def test_lfx_message_isinstance_earthmind_message(self):
        """Test that lfx.Message instance is recognized as earthmind.Message."""
        lfx_message = LfxMessage(text="hello")
        assert isinstance(lfx_message, EarthMindMessage)

    def test_earthmind_message_isinstance_lfx_message(self):
        """Test that earthmind.Message instance is recognized as lfx.Message."""
        earthmind_message = EarthMindMessage(text="hello")
        assert isinstance(earthmind_message, LfxMessage)

    def test_message_equality_across_modules(self):
        """Test that Message objects from different modules are equal."""
        lfx_message = LfxMessage(text="hello", sender="user")
        earthmind_message = EarthMindMessage(text="hello", sender="user")
        # Note: Direct equality might not work due to timestamps
        assert lfx_message.text == earthmind_message.text
        assert lfx_message.sender == earthmind_message.sender

    def test_message_interchangeable_in_functions(self):
        """Test that Message from different modules work interchangeably."""

        def process_message(msg: EarthMindMessage) -> str:
            return f"Processed: {msg.text}"

        lfx_message = LfxMessage(text="hello")
        # Should not raise type error
        result = process_message(lfx_message)
        assert result == "Processed: hello"

    def test_message_model_dump_compatible(self):
        """Test that model_dump works across module boundaries."""
        lfx_message = LfxMessage(text="hello", sender="user")
        dump = lfx_message.model_dump()
        earthmind_message = EarthMindMessage(**dump)
        assert earthmind_message.text == "hello"
        assert earthmind_message.sender == "user"

    def test_message_inherits_data_duck_typing(self):
        """Test that Message inherits duck-typing from Data."""
        lfx_message = LfxMessage(text="hello")
        # Should work as Data too
        assert isinstance(lfx_message, EarthMindData)
        assert isinstance(lfx_message, LfxData)


class TestDuckTypingWithInputs:
    """Tests for duck-typing with input validation."""

    def test_message_input_accepts_lfx_message(self):
        """Test that MessageInput accepts lfx.Message."""
        from lfx.inputs.inputs import MessageInput

        lfx_message = LfxMessage(text="hello")
        msg_input = MessageInput(name="test", value=lfx_message)
        assert isinstance(msg_input.value, (LfxMessage, EarthMindMessage))

    def test_message_input_converts_cross_module(self):
        """Test that MessageInput handles cross-module Messages."""
        from lfx.inputs.inputs import MessageInput

        earthmind_message = EarthMindMessage(text="hello")
        msg_input = MessageInput(name="test", value=earthmind_message)
        # Should recognize it as a Message
        assert msg_input.value.text == "hello"

    def test_data_input_accepts_lfx_data(self):
        """Test that DataInput accepts lfx.Data."""
        from lfx.inputs.inputs import DataInput

        lfx_data = LfxData(data={"key": "value"})
        data_input = DataInput(name="test", value=lfx_data)
        assert data_input.value == lfx_data


class TestDuckTypingEdgeCases:
    """Tests for edge cases in cross-module isinstance checks."""

    def test_different_class_name_not_cross_module(self):
        """Test that objects with different class names are not recognized as cross-module compatible."""
        from lfx.schema.cross_module import CrossModuleModel

        class CustomModel(CrossModuleModel):
            value: str

        custom = CustomModel(value="test")
        # Should not be considered a Data
        assert not isinstance(custom, LfxData)
        assert not isinstance(custom, EarthMindData)

    def test_non_pydantic_model_not_cross_module(self):
        """Test that non-Pydantic objects are not recognized as cross-module compatible."""

        class FakeData:
            def __init__(self):
                self.data = {}

        fake = FakeData()
        assert not isinstance(fake, LfxData)
        assert not isinstance(fake, EarthMindData)

    def test_missing_fields_not_cross_module(self):
        """Test that objects missing required fields are not recognized as cross-module compatible."""
        from lfx.schema.cross_module import CrossModuleModel

        class PartialData(CrossModuleModel):
            text_key: str

        partial = PartialData(text_key="text")
        # Should not be considered a full Data (missing data field)
        assert not isinstance(partial, LfxData)
        assert not isinstance(partial, EarthMindData)


class TestDuckTypingInputMixin:
    """Tests for cross-module isinstance checks in BaseInputMixin and subclasses."""

    def test_base_input_mixin_is_cross_module(self):
        """Test that BaseInputMixin uses CrossModuleModel."""
        from lfx.inputs.input_mixin import BaseInputMixin
        from lfx.schema.cross_module import CrossModuleModel

        # Check that BaseInputMixin inherits from CrossModuleModel
        assert issubclass(BaseInputMixin, CrossModuleModel)

    def test_input_subclasses_inherit_cross_module(self):
        """Test that all input types inherit cross-module support."""
        from lfx.inputs.inputs import (
            BoolInput,
            DataInput,
            FloatInput,
            IntInput,
            MessageInput,
            StrInput,
        )
        from lfx.schema.cross_module import CrossModuleModel

        for input_class in [StrInput, IntInput, FloatInput, BoolInput, DataInput, MessageInput]:
            assert issubclass(input_class, CrossModuleModel)

    def test_input_instances_work_across_modules(self):
        """Test that input instances work with duck-typing."""
        from lfx.inputs.inputs import MessageInput

        # Create with lfx Message
        lfx_msg = LfxMessage(text="hello")
        input1 = MessageInput(name="test1", value=lfx_msg)

        # Create with earthmind Message
        earthmind_msg = EarthMindMessage(text="world")
        input2 = MessageInput(name="test2", value=earthmind_msg)

        # Both should work
        assert input1.value.text == "hello"
        assert input2.value.text == "world"
