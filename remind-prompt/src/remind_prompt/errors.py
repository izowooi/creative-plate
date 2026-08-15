class ReminderError(Exception):
    """Base domain error."""


class ReminderNotFound(ReminderError):
    pass


class VersionConflict(ReminderError):
    def __init__(self, current_version: int) -> None:
        self.current_version = current_version
        super().__init__(f"Reminder changed; current occurrence version is {current_version}")


class InvalidTransition(ReminderError):
    pass
