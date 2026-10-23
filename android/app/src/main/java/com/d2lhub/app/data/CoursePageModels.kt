package com.d2lhub.app.data

data class GradeItem(
    val id: String,
    val name: String,
    /** 0 = category/row at the top, 1 = item inside a category. */
    val depth: Int,
    val isGroup: Boolean,
    val points: String?,
    val achieved: String?,
    /** Grade column as D2L shows it, e.g. "80 %". */
    val grade: String?,
    val comment: String?,
    val url: String?,
)

data class CourseGrades(
    val items: List<GradeItem>,
    val gradesUrl: String,
)

data class ContentModule(
    val id: String,
    val name: String,
    val depth: Int,
    val remaining: Int?,
    val total: Int?,
)

data class ContentTopic(
    val id: String,
    val title: String,
    val type: String?,
    val url: String,
)

data class CourseContent(
    val modules: List<ContentModule>,
    val moduleId: String?,
    val moduleTitle: String?,
    val topics: List<ContentTopic>,
    val contentUrl: String,
)
